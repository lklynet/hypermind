const crypto = require("crypto");
const { MY_POW_PREFIX } = require("../config/constants");

const generateIdentity = () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const id = publicKey.export({ type: "spki", format: "der" }).toString("hex");

    let nonce = 0;
    while (true) {
        const hash = crypto
            .createHash("sha256")
            .update(id + nonce)
            .digest("hex");
        if (hash.startsWith(MY_POW_PREFIX)) break;
        nonce++;
    }

    return { publicKey, privateKey, id, nonce };
}

module.exports = { generateIdentity };
