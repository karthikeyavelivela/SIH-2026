import mongoose from 'mongoose';
import { env } from './env';

// A MONGODB_URI with no database name in its path (e.g.
// "mongodb+srv://user:pass@cluster.mongodb.net/?appName=...") is a
// legal connection string that Mongoose silently accepts, connecting to
// a database literally named "test" instead of raising an error. Hit this
// for real this session: a local .env missing the db-name segment meant
// an entire session's live QA (9 roles logged in, real bugs found and
// "fixed", a manager account created) ran against a separate, empty-ish
// `test` database while production used the real `fyro` database the
// whole time — two roles' demo accounts genuinely didn't exist in
// production despite being "verified live" locally. Loud failure here
// beats a silently-wrong database every time.
function assertExplicitDbName(uri: string): void {
  const afterHost = uri.split('@').pop() ?? uri;
  const pathAndQuery = afterHost.split('/').slice(1).join('/'); // everything after the host
  const dbName = pathAndQuery.split('?')[0];
  if (!dbName) {
    throw new Error(
      'MONGODB_URI has no database name in its path (e.g. ".../fyro?...") — ' +
        'Mongoose would silently connect to a database named "test" instead. Add the db name explicitly.'
    );
  }
}

export async function connectDb(): Promise<typeof mongoose> {
  assertExplicitDbName(env.MONGODB_URI);
  mongoose.set('strictQuery', true);
  return mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
}
