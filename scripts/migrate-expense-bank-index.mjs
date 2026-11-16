import mongoose from "mongoose";

const collectionName = "expenses";
const expectedDatabase = process.env.MONGODB_DB?.trim() || "finance_tracker_v2";
const databaseUrl = process.env.MONGODB_URI;
const apply = process.argv.includes("--apply");
const confirmedDatabase = process.argv.find((arg) => arg.startsWith("--confirm-db="))?.slice("--confirm-db=".length);
const oldName = "userId_1_bankTransactionId_1";
const replacementName = "userId_1_bankTransactionId_objectid_unique";
const oldKey = { userId: 1, bankTransactionId: 1 };
const replacementPartial = { bankTransactionId: { $type: "objectId" } };

if (!databaseUrl) throw new Error("Set MONGODB_URI explicitly for the intended database.");
if (apply && confirmedDatabase !== expectedDatabase) {
  throw new Error(`Apply requires --confirm-db=${expectedDatabase}; no changes made.`);
}

await mongoose.connect(databaseUrl, { dbName: expectedDatabase });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection has no selected database.");
  const collection = db.collection(collectionName);
  const indexes = await collection.indexes();
  const existing = indexes.find((index) => index.name === oldName);
  const replacement = indexes.find((index) => index.name === replacementName);
  const duplicates = await collection.aggregate([
    { $match: { bankTransactionId: { $type: "objectId" } } },
    { $group: { _id: { userId: "$userId", bankTransactionId: "$bankTransactionId" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 }
  ]).toArray();

  if (duplicates.length) throw new Error(`Found duplicate genuine bank links (up to 10 shown); investigate before migration: ${JSON.stringify(duplicates)}`);
  if (existing && (JSON.stringify(existing.key) !== JSON.stringify(oldKey) || existing.unique !== true || existing.sparse !== true || existing.partialFilterExpression)) {
    throw new Error(`Index ${oldName} exists but does not exactly match the expected unique sparse key. No changes made.`);
  }
  if (replacement && (JSON.stringify(replacement.key) !== JSON.stringify(oldKey) || replacement.unique !== true || JSON.stringify(replacement.partialFilterExpression) !== JSON.stringify(replacementPartial))) {
    throw new Error(`Index ${replacementName} exists with unexpected definition. No changes made.`);
  }

  console.log(JSON.stringify({ database: expectedDatabase, collection: collectionName, indexes, oldIndex: existing ?? null, replacementIndex: replacement ?? null, duplicateLinkedRecords: 0, manualWithoutObjectId: await collection.countDocuments({ $or: [{ bankTransactionId: { $exists: false } }, { bankTransactionId: null }] }), action: apply ? "apply" : "dry-run" }, null, 2));
  if (!apply) {
    console.log("Dry-run complete; no indexes changed.");
  } else if (replacement) {
    if (existing) throw new Error(`Both indexes exist. Review manually; refusing to drop ${oldName}.`);
    console.log("Replacement already exists; migration is complete.");
  } else {
    if (!existing) throw new Error(`Expected old index ${oldName} is absent. Verify live indexes before proceeding; no changes made.`);

    // Index changes do not modify documents. The exact old index has been checked above.
    await collection.dropIndex(oldName);
    try {
      await collection.createIndex(oldKey, { name: replacementName, unique: true, partialFilterExpression: replacementPartial });
    } catch (error) {
      // Restore the verified prior definition if replacement creation fails.
      await collection.createIndex(oldKey, { name: oldName, unique: true, sparse: true }).catch(() => undefined);
      throw error;
    }
    const verified = (await collection.indexes()).find((index) => index.name === replacementName);
    if (!verified || verified.unique !== true || JSON.stringify(verified.partialFilterExpression) !== JSON.stringify(replacementPartial)) {
      throw new Error("Replacement index verification failed. Inspect indexes immediately; financial documents were not modified.");
    }
    console.log(`Verified replacement index ${replacementName}.`);
  }
} finally {
  await mongoose.disconnect();
}
