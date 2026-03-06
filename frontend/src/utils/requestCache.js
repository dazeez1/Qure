/**
 * Request Cache Utility
 * Implements request caching and deduplication to reduce redundant API calls
 */

// In-memory cache with TTL (Time To Live)
const cache = new Map();

// Pending requests map to deduplicate concurrent requests
const pendingRequests = new Map();

/**
 * Cache entry structure:
 * {
 *   data: any,
 *   timestamp: number,
 *   ttl: number (milliseconds)
 * }
 */

/**
 * Generate cache key from endpoint and params
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Request parameters
 * @returns {string} Cache key
 */
function generateCacheKey(endpoint, params = {}) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&');
  return `${endpoint}${sortedParams ? `?${sortedParams}` : ''}`;
}

/**
 * Check if cache entry is still valid
 * @param {Object} entry - Cache entry
 * @returns {boolean} True if entry is valid
 */
function isCacheValid(entry) {
  if (!entry) return false;
  const now = Date.now();
  return (now - entry.timestamp) < entry.ttl;
}

/**
 * Get cached data if available and valid
 * @param {string} key - Cache key
 * @returns {any|null} Cached data or null
 */
function getCached(key) {
  const entry = cache.get(key);
  if (isCacheValid(entry)) {
    return entry.data;
  }
  // Remove expired entry
  if (entry) {
    cache.delete(key);
  }
  return null;
}

/**
 * Set cache entry
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in milliseconds
 */
function setCache(key, data, ttl) {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

/**
 * Clear cache entry or all cache
 * @param {string} [key] - Optional cache key to clear specific entry
 */
export function clearCache(key) {
  if (key) {
    cache.delete(key);
    pendingRequests.delete(key);
  } else {
    cache.clear();
    pendingRequests.clear();
  }
}

/**
 * Cached API request with deduplication
 * @param {Function} apiFunction - API function to call
 * @param {string} endpoint - API endpoint
 * @param {Object} [options] - Options
 * @param {number} [options.ttl=300000] - Cache TTL in milliseconds (default: 5 minutes)
 * @param {boolean} [options.useCache=true] - Whether to use cache
 * @param {Object} [options.params] - Request parameters for cache key
 * @returns {Promise<any>} API response
 */
export async function cachedRequest(apiFunction, endpoint, options = {}) {
  const {
    ttl = 300000, // Default 5 minutes
    useCache = true,
    params = {},
  } = options;

  const cacheKey = generateCacheKey(endpoint, params);

  // Check cache first
  if (useCache) {
    const cached = getCached(cacheKey);
    if (cached !== null) {
      return Promise.resolve(cached);
    }
  }

  // Check if request is already pending (deduplication)
  if (pendingRequests.has(cacheKey)) {
    // Return the existing promise
    return pendingRequests.get(cacheKey);
  }

  // Create new request
  const requestPromise = apiFunction()
    .then(async (response) => {
      const result = await response.json();
      
      // Cache successful responses
      if (response.ok && useCache) {
        setCache(cacheKey, result, ttl);
      }
      
      // Remove from pending requests
      pendingRequests.delete(cacheKey);
      
      return result;
    })
    .catch((error) => {
      // Remove from pending requests on error
      pendingRequests.delete(cacheKey);
      throw error;
    });

  // Store pending request
  pendingRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Predefined cache TTLs for common data types
 */
export const CACHE_TTL = {
  DEPARTMENTS: 300000,      // 5 minutes
  WAITING_AREAS: 300000,    // 5 minutes
  ROOMS: 300000,            // 5 minutes
  DOCTOR_LOAD: 30000,       // 30 seconds
  USER_PERMISSIONS: 1800000, // 30 minutes (session-based)
  STATIC_DATA: 3600000,     // 1 hour
};

/**
 * Cleanup expired cache entries (run periodically)
 */
export function cleanupCache() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (!isCacheValid(entry)) {
      cache.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupCache, 300000);
