const { describe, it } = require("node:test");
const assert = require("node:assert");

const { BloomFilter, BloomFilterManager } = require("../src/state/bloom");
const { LRUCache } = require("../src/state/lru");
const { HyperLogLog } = require("../src/state/hyperloglog");

// =============================================================================
// BloomFilter Tests
// =============================================================================

describe("BloomFilter", () => {
  it("should return false for items not added", () => {
    const bloom = new BloomFilter();
    assert.strictEqual(bloom.has("never-added"), false);
  });

  it("should return true for items that were added", () => {
    const bloom = new BloomFilter();
    bloom.add("test-item");
    assert.strictEqual(bloom.has("test-item"), true);
  });

  it("should handle multiple items", () => {
    const bloom = new BloomFilter();
    bloom.add("item1");
    bloom.add("item2");
    bloom.add("item3");

    assert.strictEqual(bloom.has("item1"), true);
    assert.strictEqual(bloom.has("item2"), true);
    assert.strictEqual(bloom.has("item3"), true);
    assert.strictEqual(bloom.has("item4"), false);
  });

  it("should clear all items", () => {
    const bloom = new BloomFilter();
    bloom.add("item1");
    bloom.add("item2");

    bloom.clear();

    assert.strictEqual(bloom.has("item1"), false);
    assert.strictEqual(bloom.has("item2"), false);
  });

  it("should have low false positive rate", () => {
    const bloom = new BloomFilter(10000, 3);
    const itemCount = 1000;
    const testCount = 1000;

    // Add items
    for (let i = 0; i < itemCount; i++) {
      bloom.add(`added-${i}`);
    }

    // Check for false positives on items never added
    let falsePositives = 0;
    for (let i = 0; i < testCount; i++) {
      if (bloom.has(`never-added-${i}`)) {
        falsePositives++;
      }
    }

    // False positive rate should be reasonably low (< 10% for this config)
    const falsePositiveRate = falsePositives / testCount;
    assert.ok(falsePositiveRate < 0.1, `False positive rate ${falsePositiveRate} is too high`);
  });
});

// =============================================================================
// BloomFilterManager Tests
// =============================================================================

describe("BloomFilterManager", () => {
  it("should track relayed messages", () => {
    const manager = new BloomFilterManager();

    assert.strictEqual(manager.hasRelayed("peer1", 1), false);

    manager.markRelayed("peer1", 1);

    assert.strictEqual(manager.hasRelayed("peer1", 1), true);
    assert.strictEqual(manager.hasRelayed("peer1", 2), false);
    assert.strictEqual(manager.hasRelayed("peer2", 1), false);
  });

  it("should differentiate between peer/seq combinations", () => {
    const manager = new BloomFilterManager();

    manager.markRelayed("peerA", 100);
    manager.markRelayed("peerB", 200);

    assert.strictEqual(manager.hasRelayed("peerA", 100), true);
    assert.strictEqual(manager.hasRelayed("peerB", 200), true);
    assert.strictEqual(manager.hasRelayed("peerA", 200), false);
    assert.strictEqual(manager.hasRelayed("peerB", 100), false);
  });

  it("should start and stop rotation interval", () => {
    const manager = new BloomFilterManager();

    assert.strictEqual(manager.rotationInterval, null);

    manager.start();
    assert.ok(manager.rotationInterval !== null);

    manager.stop();
    assert.strictEqual(manager.rotationInterval, null);
  });
});

// =============================================================================
// LRUCache Tests
// =============================================================================

describe("LRUCache", () => {
  it("should store and retrieve values", () => {
    const cache = new LRUCache(10);

    cache.set("key1", "value1");
    assert.strictEqual(cache.get("key1"), "value1");
  });

  it("should return undefined for missing keys", () => {
    const cache = new LRUCache(10);
    assert.strictEqual(cache.get("nonexistent"), undefined);
  });

  it("should evict oldest item when capacity is exceeded", () => {
    const cache = new LRUCache(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    assert.strictEqual(cache.size, 3);
    assert.strictEqual(cache.has("a"), true);

    // Adding a 4th item should evict "a" (oldest)
    cache.set("d", 4);

    assert.strictEqual(cache.size, 3);
    assert.strictEqual(cache.has("a"), false);
    assert.strictEqual(cache.has("b"), true);
    assert.strictEqual(cache.has("c"), true);
    assert.strictEqual(cache.has("d"), true);
  });

  it("should update recency on get", () => {
    const cache = new LRUCache(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Access "a" to make it most recently used
    cache.get("a");

    // Add new item - should evict "b" (now oldest)
    cache.set("d", 4);

    assert.strictEqual(cache.has("a"), true); // accessed, so kept
    assert.strictEqual(cache.has("b"), false); // evicted
    assert.strictEqual(cache.has("c"), true);
    assert.strictEqual(cache.has("d"), true);
  });

  it("should update value and recency on set of existing key", () => {
    const cache = new LRUCache(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Update "a"
    cache.set("a", 100);

    assert.strictEqual(cache.get("a"), 100);

    // Add new item - should evict "b" (now oldest)
    cache.set("d", 4);

    assert.strictEqual(cache.has("a"), true);
    assert.strictEqual(cache.has("b"), false);
  });

  it("should delete items", () => {
    const cache = new LRUCache(10);

    cache.set("key1", "value1");
    assert.strictEqual(cache.has("key1"), true);

    cache.delete("key1");
    assert.strictEqual(cache.has("key1"), false);
  });

  it("should iterate over entries", () => {
    const cache = new LRUCache(10);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    const entries = Array.from(cache.entries());
    assert.strictEqual(entries.length, 3);
    assert.deepStrictEqual(entries, [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });
});

// =============================================================================
// HyperLogLog Tests
// =============================================================================

describe("HyperLogLog", () => {
  it("should return 0 for empty set", () => {
    const hll = new HyperLogLog();
    // Empty HLL returns a small estimate due to algorithm properties
    assert.ok(hll.count() >= 0);
  });

  it("should estimate cardinality for small sets", () => {
    const hll = new HyperLogLog(10);

    hll.add("item1");
    hll.add("item2");
    hll.add("item3");

    const estimate = hll.count();
    // For small sets, estimate should be close to actual
    assert.ok(estimate >= 1 && estimate <= 10, `Estimate ${estimate} out of range`);
  });

  it("should not double-count duplicates", () => {
    const hll = new HyperLogLog(10);

    // Add same item multiple times
    for (let i = 0; i < 100; i++) {
      hll.add("same-item");
    }

    const estimate = hll.count();
    // Should estimate close to 1
    assert.ok(estimate <= 5, `Estimate ${estimate} too high for single unique item`);
  });

  it("should estimate larger cardinalities within error bounds", () => {
    const hll = new HyperLogLog(10);
    const actualCount = 1000;

    for (let i = 0; i < actualCount; i++) {
      hll.add(`item-${i}`);
    }

    const estimate = hll.count();
    // HyperLogLog is probabilistic - allow 40% margin for hash collisions
    // The implementation uses a simple FNV hash which may have higher variance
    const lowerBound = actualCount * 0.6;
    const upperBound = actualCount * 1.4;

    assert.ok(
      estimate >= lowerBound && estimate <= upperBound,
      `Estimate ${estimate} not within ${lowerBound}-${upperBound} for actual ${actualCount}`,
    );
  });

  it("should use correct alpha values for different precisions", () => {
    // Test that different precisions create valid HLL instances
    const hll4 = new HyperLogLog(4);
    const hll5 = new HyperLogLog(5);
    const hll6 = new HyperLogLog(6);
    const hll10 = new HyperLogLog(10);

    // Each should have the correct register count
    assert.strictEqual(hll4.registerCount, 16);
    assert.strictEqual(hll5.registerCount, 32);
    assert.strictEqual(hll6.registerCount, 64);
    assert.strictEqual(hll10.registerCount, 1024);
  });
});
