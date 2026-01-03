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

// Bootstrap configuration
const ENABLE_IPV4_SCAN = process.env.ENABLE_IPV4_SCAN === 'true' || false; // Disabled by default
const SCAN_PORT = parseInt(process.env.SCAN_PORT) || 3000;
const BOOTSTRAP_TIMEOUT = parseInt(process.env.BOOTSTRAP_TIMEOUT) || 10000;
const PEER_CACHE_ENABLED = process.env.PEER_CACHE_ENABLED === 'true' || false; // Disabled by default
const PEER_CACHE_PATH = process.env.PEER_CACHE_PATH || './peers.json';
const PEER_CACHE_MAX_AGE = parseInt(process.env.PEER_CACHE_MAX_AGE) || 86400; // 24 hours in seconds
const BOOTSTRAP_PEER_IP = process.env.BOOTSTRAP_PEER_IP || null; // Debug: direct peer IP (skip scan/cache)
const MAX_SCAN_ATTEMPTS = 500000;
const SCAN_CONCURRENCY = 50;
const SCAN_CONNECTION_TIMEOUT = 300;

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
    ENABLE_IPV4_SCAN,
    SCAN_PORT,
    BOOTSTRAP_TIMEOUT,
    PEER_CACHE_ENABLED,
    PEER_CACHE_PATH,
    PEER_CACHE_MAX_AGE,
    BOOTSTRAP_PEER_IP,
    MAX_SCAN_ATTEMPTS,
    SCAN_CONCURRENCY,
    SCAN_CONNECTION_TIMEOUT,
};
