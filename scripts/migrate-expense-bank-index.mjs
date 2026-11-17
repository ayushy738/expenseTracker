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
  const unexpectedRelated = indexes.filter((index) =>
    JSON.stringify(index.key) === JSON.stringify(oldKey) && index.name !== oldName && index.name !== replacementName
  );
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
  if (unexpectedRelated.length) {
    throw new Error(`Unexpected index with the bank-transaction key pattern exists: ${unexpectedRelated.map((index) => index.name).join(", ")}. No changes made.`);
  }

  const plan = existing && replacement ? "remove_verified_obsolete_index" : existing ? "replace_obsolete_index" : replacement ? "already_migrated" : "create_replacement_index";
  console.log(JSON.stringify({ database: expectedDatabase, collection: collectionName, indexes, oldIndex: existing ?? null, replacementIndex: replacement ?? null, duplicateLinkedRecords: 0, manualWithoutObjectId: await collection.countDocuments({ $or: [{ bankTransactionId: { $exists: false } }, { bankTransactionId: null }] }), action: apply ? "apply" : "dry-run", plan }, null, 2));
  if (!apply) {
    console.log(plan === "remove_verified_obsolete_index"
      ? `Dry-run: ${oldName} is obsolete; apply will remove only that verified index and preserve ${replacementName}. No indexes changed.`
      : "Dry-run complete; no indexes changed.");
  } else if (replacement && !existing) {
    console.log("Replacement already exists; migration is complete.");
  } else if (replacement && existing) {
    // Both index definitions were verified above. Keep the replacement and
    // remove only the exact obsolete sparse index.
    await collection.dropIndex(oldName);
    const finalIndexes = await collection.indexes();
    const finalReplacement = finalIndexes.find((index) => index.name === replacementName);
    if (finalIndexes.some((index) => index.name === oldName) || !finalReplacement || finalReplacement.unique !== true || JSON.stringify(finalReplacement.key) !== JSON.stringify(oldKey) || JSON.stringify(finalReplacement.partialFilterExpression) !== JSON.stringify(replacementPartial)) {
      throw new Error(`Final index verification failed after removing ${oldName}; inspect indexes immediately.`);
    }
    console.log(JSON.stringify({ finalIndexes, removedIndex: oldName, preservedIndex: replacementName }, null, 2));
  } else {
    // Index changes do not modify documents. The exact old index has been checked above.
    if (existing) await collection.dropIndex(oldName);
    try {
      await collection.createIndex(oldKey, { name: replacementName, unique: true, partialFilterExpression: replacementPartial });
    } catch (error) {
      // Restore the verified prior definition if replacement creation fails.
      if (existing) await collection.createIndex(oldKey, { name: oldName, unique: true, sparse: true }).catch(() => undefined);
      throw error;
    }
    const finalIndexes = await collection.indexes();
    const verified = finalIndexes.find((index) => index.name === replacementName);
    if (!verified || verified.unique !== true || JSON.stringify(verified.key) !== JSON.stringify(oldKey) || JSON.stringify(verified.partialFilterExpression) !== JSON.stringify(replacementPartial) || finalIndexes.some((index) => index.name === oldName)) {
      if (existing && !finalIndexes.some((index) => index.name === oldName)) {
        await collection.createIndex(oldKey, { name: oldName, unique: true, sparse: true }).catch(() => undefined);
      }
      throw new Error("Replacement index verification failed. Inspect indexes immediately; financial documents were not modified.");
    }
    console.log(JSON.stringify({ finalIndexes, verifiedIndex: replacementName, removedIndex: existing ? oldName : null }, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
