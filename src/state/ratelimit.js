const { CHAT_MIN_COOLDOWN, CHAT_BURST_LIMIT, CHAT_BURST_WINDOW } = require("../config/constants");

class ChatRateLimiter {
    constructor() {
        // Map of id -> { timestamps: number[], lastMessage: number }
        this.senders = new Map();
    }

    /**
     * Check if a sender can send a message
     * @param {string} id - The sender's node ID
     * @returns {boolean} - Whether the sender can send
     */
    canSend(id) {
        const now = Date.now();
        const sender = this.senders.get(id);

        if (!sender) {
            return true;
        }

        // Check minimum cooldown
        if (now - sender.lastMessage < CHAT_MIN_COOLDOWN) {
            return false;
        }

        // Check burst limit - count messages in the burst window
        const windowStart = now - CHAT_BURST_WINDOW;
        const recentMessages = sender.timestamps.filter(ts => ts > windowStart);

        if (recentMessages.length >= CHAT_BURST_LIMIT) {
            return false;
        }

        return true;
    }

    /**
     * Record a message from a sender
     * @param {string} id - The sender's node ID
     */
    recordMessage(id) {
        const now = Date.now();
        let sender = this.senders.get(id);

        if (!sender) {
            sender = { timestamps: [], lastMessage: 0 };
            this.senders.set(id, sender);
        }

        // Clean up old timestamps outside the burst window
        const windowStart = now - CHAT_BURST_WINDOW;
        sender.timestamps = sender.timestamps.filter(ts => ts > windowStart);

        // Record new message
        sender.timestamps.push(now);
        sender.lastMessage = now;
    }

    /**
     * Get time in ms until the sender can send again
     * @param {string} id - The sender's node ID
     * @returns {number} - Milliseconds until allowed, 0 if allowed now
     */
    getTimeUntilAllowed(id) {
        const now = Date.now();
        const sender = this.senders.get(id);

        if (!sender) {
            return 0;
        }

        // Check minimum cooldown first
        const cooldownRemaining = CHAT_MIN_COOLDOWN - (now - sender.lastMessage);
        if (cooldownRemaining > 0) {
            return cooldownRemaining;
        }

        // Check burst limit
        const windowStart = now - CHAT_BURST_WINDOW;
        const recentMessages = sender.timestamps.filter(ts => ts > windowStart);

        if (recentMessages.length >= CHAT_BURST_LIMIT) {
            // Wait until the oldest message in window expires
            const oldestInWindow = Math.min(...recentMessages);
            return (oldestInWindow + CHAT_BURST_WINDOW) - now;
        }

        return 0;
    }

    /**
     * Clean up old sender data to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        const staleThreshold = CHAT_BURST_WINDOW * 2;

        for (const [id, sender] of this.senders) {
            if (now - sender.lastMessage > staleThreshold) {
                this.senders.delete(id);
            }
        }
    }
}

module.exports = { ChatRateLimiter };
