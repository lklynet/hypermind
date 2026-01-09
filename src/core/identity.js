const os = require("os");
const crypto = require("crypto");
const { MY_POW_PREFIX } = require("../config/constants");
const { generateScreenname } = require("../utils/name-generator");

const generateIdentity = () => {
  // 1. Create cryptographic keys for security
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  
  // 2. Create a unique ID from the public key
  const id = publicKey.export({ type: "spki", format: "der" }).toString("hex");
  
  // 3. Generate a fun name (like "Cyber-Dolphin")
  const screenname = generateScreenname(id);

    // We use the 'os' module to peek at the server's actual specs.
  const hardware = {
    // os.totalmem() gives bytes. We divide by 1024^3 to get Gigabytes (GB).
    // Math.round removes decimals so we get a clean number (e.g., "16").
    ram: Math.round(os.totalmem() / (1024 * 1024 * 1024)), 
    
    // os.cpus() returns an array of cores. The .length property counts them.
    cpus: os.cpus().length, 
  };
  
  // 4. Proof of Work (PoW) - keeps spam nodes out
  let nonce = 0;
  while (true) {
    const hash = crypto
      .createHash("sha256")
      .update(id + nonce)
      .digest("hex");
    if (hash.startsWith(MY_POW_PREFIX)) break;
    nonce++;
  }

  // 5. Return the identity object
  
  return { publicKey, privateKey, id, nonce, screenname, hardware };
};

module.exports = { generateIdentity };
