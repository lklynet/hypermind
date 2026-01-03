/**
 * Simple Bloom filter for message deduplication
 * Prevents re-relaying messages we've already seen
 */
class BloomFilter {
    constructor(size = 10000, hashCount = 3) {
        this.size = size;
        this.hashCount = hashCount;
        this.bits = new Uint8Array(Math.ceil(size / 8));
    }

    _hash(str, seed) {
        let h = seed;
        for (let i = 0; i < str.length; i++) {
            h = (h * 31 + str.charCodeAt(i)) >>> 0;
        }
        return h % this.size;
    }

    add(item) {
        for (let i = 0; i < this.hashCount; i++) {
            const idx = this._hash(item, i * 0x9e3779b9);
            this.bits[idx >>> 3] |= (1 << (idx & 7));
        }
    }

    has(item) {
        for (let i = 0; i < this.hashCount; i++) {
            const idx = this._hash(item, i * 0x9e3779b9);
            if ((this.bits[idx >>> 3] & (1 << (idx & 7))) === 0) {
                return false;
            }
        }
        return true;
    }

    clear() {
        this.bits.fill(0);
    }
}

/**
 * Time-bucketed bloom filter manager
 * Rotates every 30 seconds to prevent unbounded growth
 */
class BloomFilterManager {
    constructor() {
        this.currentBloom = new BloomFilter();
        this.previousBloom = new BloomFilter();
        this.rotationInterval = null;
    }

    start() {
        this.rotationInterval = setInterval(() => {
            this.previousBloom = this.currentBloom;
            this.currentBloom = new BloomFilter();
        }, 30000);
    }

    stop() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
            this.rotationInterval = null;
        }
    }

    hasRelayed(id, seq) {
        const key = `${id}:${seq}`;
        return this.currentBloom.has(key) || this.previousBloom.has(key);
    }

    markRelayed(id, seq) {
        const key = `${id}:${seq}`;
        this.currentBloom.add(key);
    }
}

module.exports = { BloomFilter, BloomFilterManager };
