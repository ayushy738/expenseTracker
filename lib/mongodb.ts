import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;

type CachedConnection = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseConnection: CachedConnection | undefined;
}

const cached = global.mongooseConnection ?? { conn: null, promise: null };

if (!global.mongooseConnection) {
  global.mongooseConnection = cached;
}

export async function connectToDatabase() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (cached.conn) return cached.conn;

  const hasDatabaseName = Boolean(new URL(MONGODB_URI).pathname.replace("/", ""));
  const options = {
    bufferCommands: false,
    dbName: MONGODB_DB || (hasDatabaseName ? undefined : "expenseTracker")
  };

  cached.promise ??= mongoose.connect(MONGODB_URI, options);

  cached.conn = await cached.promise;
  return cached.conn;
}
