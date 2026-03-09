/**
 * Simple in-memory cache with TTL.
 * 
 * NOTE:
 * - Process-local only (per backend instance)
 * - Always key by hospital or clear prefix to preserve isolation
 * - Cache is a performance hint, NOT a source of truth
 */

const cacheStore = new Map();

/**
 * Get a cached value if present and not expired.
 * @param {string} key
 * @returns {*|null}
 */
export function getCache(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;

  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Store a value in the cache with a TTL.
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs - Time to live in milliseconds
 */
export function setCache(key, value, ttlMs = 60000) {
  const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
  cacheStore.set(key, { value, expiresAt });
}

/**
 * Invalidate a single cache key.
 * @param {string} key
 */
export function invalidateCacheKey(key) {
  cacheStore.delete(key);
}

/**
 * Invalidate all keys that start with the given prefix.
 * Useful for hospital-scoped or resource-scoped keys.
 * @param {string} prefix
 */
export function invalidateCacheByPrefix(prefix) {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

/**
 * Clear all cache entries.
 * Intended mainly for tests or admin tooling.
 */
export function clearAllCache() {
  cacheStore.clear();
}

