/**
 * Simple LRU (Least Recently Used) Cache
 * Uses Map's insertion order guarantee to track recency
 */
class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;
        const value = this.cache.get(key);
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        // Delete first to update position if key exists
        this.cache.delete(key);
        this.cache.set(key, value);
        // Evict oldest if over capacity
        if (this.cache.size > this.capacity) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        return this.cache.delete(key);
    }

    get size() {
        return this.cache.size;
    }

    /**
     * Iterate over entries (for cleanup operations)
     */
    *entries() {
        yield* this.cache.entries();
    }
}

module.exports = { LRUCache };

