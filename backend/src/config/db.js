import mongoose from 'mongoose';

/**
 * Connect to MongoDB. Returns true on success. On failure the server keeps
 * running with the in-memory store so the engine remains fully usable
 * (data simply does not persist across restarts).
 * @param {string} uri
 * @returns {Promise<boolean>}
 */
export async function connectDB(uri) {
  if (!uri) {
    console.warn('[db] No MONGODB_URI set — running with in-memory store (data will not persist).');
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    console.log('[db] MongoDB connected.');
    return true;
  } catch (err) {
    console.warn(`[db] MongoDB unavailable (${err.message}) — falling back to in-memory store. Data will not persist.`);
    return false;
  }
}

/**
 * Whether mongoose currently holds a live connection.
 * @returns {boolean}
 */
export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
