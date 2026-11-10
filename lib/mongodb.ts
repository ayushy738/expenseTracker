import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;

export function resolveDatabaseName(_uri: string, configuredName?: string) {
  const override = configuredName?.trim();
  if (override) return override;
  // A URI often still contains the old application's database name. Default
  // to the isolated v2 database instead of silently reusing that old path.
  return "finance_tracker_v2";
}

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

  const options = {
    bufferCommands: false,
    // MONGODB_DB is authoritative so Atlas URIs that contain an old database
    // path cannot silently direct this deployment to the wrong database.
    dbName: resolveDatabaseName(MONGODB_URI, MONGODB_DB)
  };

  cached.promise ??= mongoose.connect(MONGODB_URI, options);

  cached.conn = await cached.promise;
  return cached.conn;
}
