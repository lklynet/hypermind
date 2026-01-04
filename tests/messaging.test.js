const { describe, it } = require("node:test");
const assert = require("node:assert");

const { validateMessage } = require("../src/p2p/messaging");
const { MAX_MESSAGE_SIZE } = require("../src/config/constants");

// =============================================================================
// validateMessage Tests - HEARTBEAT
// =============================================================================

describe("validateMessage - HEARTBEAT", () => {
  const validHeartbeat = {
    type: "HEARTBEAT",
    id: "abc123def456",
    seq: 1,
    hops: 0,
    nonce: 12345,
    sig: "deadbeef",
  };

  it("should accept valid HEARTBEAT message", () => {
    assert.ok(validateMessage(validHeartbeat), "Valid HEARTBEAT should be accepted");
  });

  it("should reject HEARTBEAT missing type", () => {
    const msg = { ...validHeartbeat };
    delete msg.type;
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject HEARTBEAT missing id", () => {
    const msg = { ...validHeartbeat };
    delete msg.id;
    assert.ok(!validateMessage(msg), "HEARTBEAT without id should be rejected");
  });

  it("should reject HEARTBEAT missing seq", () => {
    const msg = { ...validHeartbeat };
    delete msg.seq;
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject HEARTBEAT with non-numeric seq", () => {
    const msg = { ...validHeartbeat, seq: "1" };
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject HEARTBEAT missing hops", () => {
    const msg = { ...validHeartbeat };
    delete msg.hops;
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject HEARTBEAT with non-numeric hops", () => {
    const msg = { ...validHeartbeat, hops: "0" };
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject HEARTBEAT missing nonce", () => {
    const msg = { ...validHeartbeat };
    delete msg.nonce;
    assert.ok(!validateMessage(msg), "HEARTBEAT without nonce should be rejected");
  });

  it("should reject HEARTBEAT missing sig", () => {
    const msg = { ...validHeartbeat };
    delete msg.sig;
    assert.ok(!validateMessage(msg), "HEARTBEAT without sig should be rejected");
  });

  it("should reject HEARTBEAT with extra fields", () => {
    const msg = { ...validHeartbeat, extraField: "malicious" };
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should accept HEARTBEAT with higher seq/hops values", () => {
    const msg = { ...validHeartbeat, seq: 999999, hops: 2 };
    assert.ok(validateMessage(msg), "HEARTBEAT with higher values should be accepted");
  });
});

// =============================================================================
// validateMessage Tests - LEAVE
// =============================================================================

describe("validateMessage - LEAVE", () => {
  const validLeave = {
    type: "LEAVE",
    id: "abc123def456",
    hops: 0,
    sig: "deadbeef",
  };

  it("should accept valid LEAVE message", () => {
    assert.ok(validateMessage(validLeave), "Valid LEAVE should be accepted");
  });

  it("should reject LEAVE missing type", () => {
    const msg = { ...validLeave };
    delete msg.type;
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject LEAVE missing id", () => {
    const msg = { ...validLeave };
    delete msg.id;
    assert.ok(!validateMessage(msg), "LEAVE without id should be rejected");
  });

  it("should reject LEAVE missing hops", () => {
    const msg = { ...validLeave };
    delete msg.hops;
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject LEAVE with non-numeric hops", () => {
    const msg = { ...validLeave, hops: "0" };
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject LEAVE missing sig", () => {
    const msg = { ...validLeave };
    delete msg.sig;
    assert.ok(!validateMessage(msg), "LEAVE without sig should be rejected");
  });

  it("should reject LEAVE with extra fields", () => {
    const msg = { ...validLeave, extraField: "malicious" };
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should reject LEAVE with seq field (not allowed)", () => {
    const msg = { ...validLeave, seq: 1 };
    assert.strictEqual(validateMessage(msg), false);
  });
});

// =============================================================================
// validateMessage Tests - General
// =============================================================================

describe("validateMessage - General", () => {
  it("should reject null message", () => {
    assert.strictEqual(validateMessage(null), false);
  });

  it("should reject undefined message", () => {
    assert.strictEqual(validateMessage(undefined), false);
  });

  it("should reject non-object message", () => {
    assert.strictEqual(validateMessage("string"), false);
    assert.strictEqual(validateMessage(123), false);
    assert.strictEqual(validateMessage([]), false);
  });

  it("should reject empty object", () => {
    assert.strictEqual(validateMessage({}), false);
  });

  it("should reject unknown message type", () => {
    assert.strictEqual(
      validateMessage({
        type: "UNKNOWN",
        id: "abc",
        hops: 0,
        sig: "deadbeef",
      }),
      false,
    );
  });

  it("should reject message exceeding MAX_MESSAGE_SIZE", () => {
    const largeId = "x".repeat(MAX_MESSAGE_SIZE);
    const msg = {
      type: "HEARTBEAT",
      id: largeId,
      seq: 1,
      hops: 0,
      nonce: 12345,
      sig: "deadbeef",
    };
    assert.strictEqual(validateMessage(msg), false);
  });

  it("should accept message just under MAX_MESSAGE_SIZE", () => {
    // Create a valid message that's close to but under the limit
    const msg = {
      type: "HEARTBEAT",
      id: "a".repeat(100), // Reasonable length
      seq: 1,
      hops: 0,
      nonce: 12345,
      sig: "b".repeat(128), // Ed25519 signature length
    };

    const msgSize = JSON.stringify(msg).length;
    assert.ok(
      msgSize < MAX_MESSAGE_SIZE,
      `Message size ${msgSize} should be under ${MAX_MESSAGE_SIZE}`,
    );
    assert.ok(validateMessage(msg), "Message under size limit should be accepted");
  });
});
