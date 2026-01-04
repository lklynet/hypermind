const crypto = require("crypto");

const TOPIC_NAME = "hypermind-lklynet-v1";
const TOPIC = crypto.createHash("sha256").update(TOPIC_NAME).digest();

/**
 * fccview here, frankly I don't think I can make this more secure, we can change it to `00000` but
 * that means until everyone upgrade there'll be a divide between nodes.
 * 
 * I ran it that way and I was fairly isolated, with hundreds of failed POW, shame.
 * adding an extra 0 makes it very expensive on attacker to make it worth the fun for them, so maybe consider it.
 * 
 */
const POW_PREFIX = "0000";

const MAX_PEERS = parseInt(process.env.MAX_PEERS) || 1000000;
const MAX_MESSAGE_SIZE = 2048;
const MAX_RELAY_HOPS = 2;
const MAX_CONNECTIONS = 32;

const HEARTBEAT_INTERVAL = 5000;
const CONNECTION_ROTATION_INTERVAL = 30000;
const PEER_TIMEOUT = 15000;
const BROADCAST_THROTTLE = 1000;
const DIAGNOSTICS_INTERVAL = 10000;
const PORT = process.env.PORT || 3000;
const ENABLE_CHAT = process.env.ENABLE_CHAT === 'true';

// Chat rate limiting (advanced)
const CHAT_MIN_COOLDOWN = 2000;      // 2s minimum between messages
const CHAT_BURST_LIMIT = 5;          // 5 messages per burst window
const CHAT_BURST_WINDOW = 30000;     // 30s burst window
const CHAT_MAX_LENGTH = 140;         // Max message length
const CHAT_NICK_MAX_LENGTH = 16;     // Max nickname length

module.exports = {
    TOPIC_NAME,
    TOPIC,
    POW_PREFIX,
    MAX_PEERS,
    MAX_MESSAGE_SIZE,
    MAX_RELAY_HOPS,
    MAX_CONNECTIONS,
    HEARTBEAT_INTERVAL,
    CONNECTION_ROTATION_INTERVAL,
    PEER_TIMEOUT,
    BROADCAST_THROTTLE,
    DIAGNOSTICS_INTERVAL,
    PORT,
    ENABLE_CHAT,
    CHAT_MIN_COOLDOWN,
    CHAT_BURST_LIMIT,
    CHAT_BURST_WINDOW,
    CHAT_MAX_LENGTH,
    CHAT_NICK_MAX_LENGTH,
};
