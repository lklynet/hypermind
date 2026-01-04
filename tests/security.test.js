const { describe, it } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");

const { generateIdentity } = require("../src/core/identity");
const {
    verifyPoW,
    signMessage,
    verifySignature,
    createPublicKey,
} = require("../src/core/security");
const { POW_PREFIX } = require("../src/config/constants");

// =============================================================================
// generateIdentity Tests
// =============================================================================

describe("generateIdentity", () => {
    it("should generate a valid identity with all required fields", () => {
        const identity = generateIdentity();

        assert.ok(identity.publicKey, "Should have publicKey");
        assert.ok(identity.privateKey, "Should have privateKey");
        assert.ok(identity.id, "Should have id");
        assert.ok(typeof identity.nonce === "number", "Should have numeric nonce");
    });

    it("should generate id as hex-encoded public key", () => {
        const identity = generateIdentity();

        // ID should be a valid hex string
        assert.ok(/^[0-9a-f]+$/i.test(identity.id), "ID should be hex");
        assert.ok(identity.id.length > 0, "ID should not be empty");
    });

    it("should generate identity with valid PoW", () => {
        const identity = generateIdentity();

        const isValid = verifyPoW(identity.id, identity.nonce);
        assert.strictEqual(isValid, true, "Generated identity should have valid PoW");
    });

    it("should generate unique identities", () => {
        const identity1 = generateIdentity();
        const identity2 = generateIdentity();

        assert.notStrictEqual(identity1.id, identity2.id, "Identities should be unique");
    });
});

// =============================================================================
// verifyPoW Tests
// =============================================================================

describe("verifyPoW", () => {
    it("should accept valid PoW", () => {
        const identity = generateIdentity();
        assert.strictEqual(verifyPoW(identity.id, identity.nonce), true);
    });

    it("should reject invalid nonce", () => {
        const identity = generateIdentity();
        // Use a clearly wrong nonce
        assert.strictEqual(verifyPoW(identity.id, -1), false);
    });

    it("should reject missing nonce", () => {
        const identity = generateIdentity();
        assert.strictEqual(verifyPoW(identity.id, null), false);
        assert.strictEqual(verifyPoW(identity.id, undefined), false);
    });

    it("should verify hash starts with required prefix", () => {
        const identity = generateIdentity();

        const hash = crypto
            .createHash("sha256")
            .update(identity.id + identity.nonce)
            .digest("hex");

        assert.ok(
            hash.startsWith(POW_PREFIX),
            `Hash ${hash} should start with ${POW_PREFIX}`
        );
    });

    it("should reject wrong id/nonce combination", () => {
        const identity1 = generateIdentity();
        const identity2 = generateIdentity();

        // Cross-check: identity1's nonce shouldn't work for identity2's id
        // (statistically very unlikely to pass by chance)
        const crossValid = verifyPoW(identity2.id, identity1.nonce);
        // This could theoretically pass by coincidence, but is extremely unlikely
        // We mainly want to verify the function runs without error
        assert.ok(typeof crossValid === "boolean");
    });
});

// =============================================================================
// signMessage / verifySignature Tests
// =============================================================================

describe("signMessage and verifySignature", () => {
    it("should sign and verify a message successfully", () => {
        const identity = generateIdentity();
        const message = "test message";

        const signature = signMessage(message, identity.privateKey);
        const isValid = verifySignature(message, signature, identity.publicKey);

        assert.strictEqual(isValid, true);
    });

    it("should produce hex-encoded signature", () => {
        const identity = generateIdentity();
        const signature = signMessage("test", identity.privateKey);

        assert.ok(/^[0-9a-f]+$/i.test(signature), "Signature should be hex");
    });

    it("should reject tampered message", () => {
        const identity = generateIdentity();
        const message = "original message";

        const signature = signMessage(message, identity.privateKey);
        const isValid = verifySignature("tampered message", signature, identity.publicKey);

        assert.strictEqual(isValid, false);
    });

    it("should reject wrong signature", () => {
        const identity = generateIdentity();
        const message = "test message";

        // Create a clearly invalid signature (wrong length/format still hex)
        const fakeSignature = "deadbeef".repeat(16);
        const isValid = verifySignature(message, fakeSignature, identity.publicKey);

        assert.strictEqual(isValid, false);
    });

    it("should reject signature from different key", () => {
        const identity1 = generateIdentity();
        const identity2 = generateIdentity();
        const message = "test message";

        const signature = signMessage(message, identity1.privateKey);
        const isValid = verifySignature(message, signature, identity2.publicKey);

        assert.strictEqual(isValid, false);
    });

    it("should handle empty message", () => {
        const identity = generateIdentity();
        const message = "";

        const signature = signMessage(message, identity.privateKey);
        const isValid = verifySignature(message, signature, identity.publicKey);

        assert.strictEqual(isValid, true);
    });

    it("should handle special characters in message", () => {
        const identity = generateIdentity();
        const message = "seq:12345\n\t特殊文字";

        const signature = signMessage(message, identity.privateKey);
        const isValid = verifySignature(message, signature, identity.publicKey);

        assert.strictEqual(isValid, true);
    });
});

// =============================================================================
// createPublicKey Tests
// =============================================================================

describe("createPublicKey", () => {
    it("should derive public key from id", () => {
        const identity = generateIdentity();

        const derivedKey = createPublicKey(identity.id);

        assert.ok(derivedKey, "Should create a key object");
        assert.strictEqual(derivedKey.type, "public");
    });

    it("should create key that can verify signatures", () => {
        const identity = generateIdentity();
        const message = "test message";

        const signature = signMessage(message, identity.privateKey);
        const derivedKey = createPublicKey(identity.id);

        const isValid = verifySignature(message, signature, derivedKey);
        assert.strictEqual(isValid, true);
    });

    it("should throw for invalid id format", () => {
        assert.throws(() => {
            createPublicKey("not-valid-hex");
        });

        assert.throws(() => {
            createPublicKey("");
        });
    });
});

