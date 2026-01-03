const crypto = require('crypto');

/**
 * Feistel cipher implementation for deterministic randomized IPv4 address enumeration.
 * 
 * Uses a 4-round Feistel network to permute the IPv4 address space (0 to 2^32-1) in
 * pseudorandom order. The permutation is deterministic based on a seed, allowing
 * each node to scan addresses in a unique but reproducible order. Memory usage is O(1)
 * as we generate addresses on-demand rather than pre-allocating a list.
 * 
 */

/**
 * Mixing function for Feistel rounds. Uses XOR and bit rotation for fast mixing.
 * @param {number} x - Input value (32-bit)
 * @param {Buffer|Uint8Array} key - Round key (derived from seed)
 * @returns {number} Mixed value
 */
function feistelMix(x, key) {
  // Convert to Buffer if needed for readUInt32BE
  if (!(key instanceof Buffer)) {
    key = Buffer.from(key);
  }
  
  const k0 = key.readUInt32BE(0);
  const k1 = key.readUInt32BE(4);
  
  // Simple but effective: XOR, rotate, XOR again
  let mixed = x ^ k0;
  mixed = ((mixed << 7) | (mixed >>> 25)) >>> 0; // Rotate left by 7
  mixed ^= k1;
  mixed = ((mixed << 13) | (mixed >>> 19)) >>> 0; // Rotate left by 13
  
  return mixed >>> 0; // Ensure 32-bit unsigned
}

/**
 * Derive round keys from seed using HKDF-SHA256.
 * @param {Buffer|number} seed - Random seed (number converted to Buffer or direct Buffer)
 * @returns {Array<Buffer>} Array of 4 round keys, each 8 bytes
 */
function deriveRoundKeys(seed) {
  if (typeof seed === 'number') {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(seed));
    seed = buf;
  }

  const salt = Buffer.alloc(0);
  const info = Buffer.from('feistel-ipv4-scan', 'utf8');
  const hkdf = crypto.hkdfSync('sha256', seed, salt, info, 32);

  return [
    hkdf.slice(0, 8),
    hkdf.slice(8, 16),
    hkdf.slice(16, 24),
    hkdf.slice(24, 32),
  ];
}

/**
 * Apply a single Feistel round to split the address space.
 * Splits 32-bit address into two 16-bit halves, applies mixing to right half,
 * then XORs with left half (standard Feistel operation).
 * 
 * @param {number} address - 32-bit IPv4 address (as integer)
 * @param {Buffer} roundKey - 8-byte key for this round
 * @returns {number} Permuted 32-bit value
 */
function feistelRound(address, roundKey) {
  const left = (address >>> 16) & 0xFFFF;
  const right = address & 0xFFFF;
  
  // Expand right to 32-bit, mix, take bottom 16 bits, XOR with left
  const rightExpanded = (right | (right << 16)) >>> 0;
  const mixed = feistelMix(rightExpanded, roundKey);
  const newLeft = (right ^ ((mixed >>> 0) & 0xFFFF)) & 0xFFFF;
  
  return ((newLeft << 16) | left) >>> 0;
}

/**
 * Create a Feistel generator for pseudorandom IPv4 enumeration.
 * 
 * @param {number|Buffer} seed - Seed for deterministic permutation
 * @returns {Object} Iterator-like object with next() method
 * 
 * Usage:
 *   const gen = createFeistelGenerator(12345);
 *   for (let i = 0; i < 5; i++) {
 *     const addr = gen.next();
 *     console.log(ipv4ToString(addr));
 *   }
 */
function createFeistelGenerator(seed) {
  const roundKeys = deriveRoundKeys(seed);
  let currentIndex = 0;
  
  return {
    next() {
      if (currentIndex >= 0xFFFFFFFF) {
        return { done: true, value: undefined };
      }
      
      let permuted = currentIndex;
      
      // Apply 4 Feistel rounds
      for (let i = 0; i < 4; i++) {
        permuted = feistelRound(permuted, roundKeys[i]);
      }
      
      currentIndex = (currentIndex + 1) >>> 0;
      
      return {
        done: false,
        value: permuted >>> 0,
      };
    },

    // Allow iteration reset
    reset() {
      currentIndex = 0;
    },

    // Get current progress (0 to 1)
    progress() {
      return currentIndex / 0x100000000;
    },
  };
}

/**
 * Convert 32-bit integer to IPv4 address string.
 * @param {number} addr - 32-bit address
 * @returns {string} Dotted-quad notation (e.g., "192.168.1.1")
 */
function ipv4ToString(addr) {
  return [
    (addr >>> 24) & 0xFF,
    (addr >>> 16) & 0xFF,
    (addr >>> 8) & 0xFF,
    addr & 0xFF,
  ].join('.');
}

/**
 * Convert IPv4 address string to 32-bit integer.
 * @param {string} ip - Dotted-quad notation
 * @returns {number} 32-bit address
 */
function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return (
    ((parts[0] & 0xFF) << 24) |
    ((parts[1] & 0xFF) << 16) |
    ((parts[2] & 0xFF) << 8) |
    (parts[3] & 0xFF)
  ) >>> 0;
}

module.exports = {
  createFeistelGenerator,
  ipv4ToString,
  ipv4ToInt,
  feistelRound,
  feistelMix,
  deriveRoundKeys,
};
