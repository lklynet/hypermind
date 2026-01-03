const crypto = require("crypto");
const { VERIFICATION_POW_PREFIX } = require("../config/constants");

const verifyPoW = (id, nonce) => {
    if (!nonce) return false;
    const powHash = crypto
        .createHash("sha256")
        .update(id + nonce)
        .digest("hex");
    return powHash.startsWith(VERIFICATION_POW_PREFIX);
}

const signMessage = (message, privateKey) => {
    return crypto.sign(null, Buffer.from(message), privateKey).toString("hex");
}

const verifySignature = (message, signature, publicKey) => {
    try {
        return crypto.verify(
            null,
            Buffer.from(message),
            publicKey,
            Buffer.from(signature, "hex")
        );
    } catch (e) {
        return false;
    }
}

const createPublicKey = (id) => {
    return crypto.createPublicKey({
        key: Buffer.from(id, "hex"),
        format: "der",
        type: "spki",
    });
}

module.exports = {
    verifyPoW,
    signMessage,
    verifySignature,
    createPublicKey,
};
