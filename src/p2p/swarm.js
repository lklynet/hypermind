const Hyperswarm = require("hyperswarm");
const { signMessage } = require("../core/security");
const { TOPIC, TOPIC_NAME, HEARTBEAT_INTERVAL, MAX_CONNECTIONS, CONNECTION_ROTATION_INTERVAL, ENABLE_CHAT } = require("../config/constants");

class SwarmManager {
    constructor(identity, peerManager, diagnostics, messageHandler, relayFn, broadcastFn, chatSystemFn) {
        this.identity = identity;
        this.peerManager = peerManager;
        this.diagnostics = diagnostics;
        this.messageHandler = messageHandler;
        this.relayFn = relayFn;
        this.broadcastFn = broadcastFn;
        this.chatSystemFn = chatSystemFn;

        this.swarm = new Hyperswarm();
        this.heartbeatInterval = null;
        this.rotationInterval = null;
    }

    async start() {
        this.swarm.on("connection", (socket) => this.handleConnection(socket));

        const discovery = this.swarm.join(TOPIC);
        await discovery.flushed();

        this.startHeartbeat();
        this.startRotation();
    }

    handleConnection(socket) {
        if (this.swarm.connections.size > MAX_CONNECTIONS) {
            socket.destroy();
            return;
        }

        socket.connectedAt = Date.now();

        const sig = signMessage(`seq:${this.peerManager.getSeq()}`, this.identity.privateKey);
        const hello = JSON.stringify({
            type: "HEARTBEAT",
            id: this.identity.id,
            seq: this.peerManager.getSeq(),
            hops: 0,
            nonce: this.identity.nonce,
            sig,
        });
        socket.write(hello);
        this.broadcastFn();

        socket.on("data", (data) => {
            this.diagnostics.increment("bytesReceived", data.length);
            try {
                const msgs = data
                    .toString()
                    .split("\n")
                    .filter((x) => x.trim());
                for (const msgStr of msgs) {
                    const msg = JSON.parse(msgStr);
                    this.messageHandler.handleMessage(msg, socket);
                }
            } catch (e) {
            }
        });

        socket.on("close", () => {
            if (socket.peerId && this.peerManager.hasPeer(socket.peerId)) {
                this.peerManager.removePeer(socket.peerId);
            }
            this.broadcastFn();
        });

        socket.on("error", () => { });
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            const seq = this.peerManager.incrementSeq();
            this.peerManager.addOrUpdatePeer(this.identity.id, seq, null);

            const sig = signMessage(`seq:${seq}`, this.identity.privateKey);
            const heartbeat = JSON.stringify({
                type: "HEARTBEAT",
                id: this.identity.id,
                seq,
                hops: 0,
                nonce: this.identity.nonce,
                sig,
            }) + "\n";

            for (const socket of this.swarm.connections) {
                socket.write(heartbeat);
            }

            const removed = this.peerManager.cleanupStalePeers();
            if (removed > 0) {
                this.broadcastFn();
            }
        }, HEARTBEAT_INTERVAL);
    }

    startRotation() {
        this.rotationInterval = setInterval(() => {
            if (this.swarm.connections.size < MAX_CONNECTIONS / 2) return;

            let oldest = null;
            for (const socket of this.swarm.connections) {
                if (!oldest || socket.connectedAt < oldest.connectedAt) {
                    oldest = socket;
                }
            }

            if (oldest) {
                if (ENABLE_CHAT && this.chatSystemFn && oldest.peerId) {
                    this.chatSystemFn({
                        type: "SYSTEM",
                        content: `Connection with Node ...${oldest.peerId.slice(-8)} severed (Rotation).`,
                        timestamp: Date.now()
                    });
                }
                oldest.destroy();
            }
        }, CONNECTION_ROTATION_INTERVAL);
    }

    shutdown() {
        const sig = signMessage(`type:LEAVE:${this.identity.id}`, this.identity.privateKey);
        const goodbye = JSON.stringify({
            type: "LEAVE",
            id: this.identity.id,
            hops: 0,
            sig,
        }) + "\n";

        for (const socket of this.swarm.connections) {
            socket.write(goodbye);
        }

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }

        setTimeout(() => {
            process.exit(0);
        }, 500);
    }

    getSwarm() {
        return this.swarm;
    }

    broadcastChat(msg) {
        if (!ENABLE_CHAT) return;
        const msgStr = JSON.stringify(msg) + "\n";
        for (const socket of this.swarm.connections) {
            socket.write(msgStr);
        }
    }
}

module.exports = { SwarmManager };
