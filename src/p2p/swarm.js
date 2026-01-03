const Hyperswarm = require("hyperswarm");
const net = require("net");
const { signMessage } = require("../core/security");
const { TOPIC, TOPIC_NAME, HEARTBEAT_INTERVAL, MAX_CONNECTIONS, CONNECTION_ROTATION_INTERVAL } = require("../config/constants");

class SwarmManager {
    constructor(identity, peerManager, diagnostics, messageHandler, relayFn, broadcastFn) {
        this.identity = identity;
        this.peerManager = peerManager;
        this.diagnostics = diagnostics;
        this.messageHandler = messageHandler;
        this.relayFn = relayFn;
        this.broadcastFn = broadcastFn;

        this.swarm = new Hyperswarm();
        this.heartbeatInterval = null;
        this.rotationInterval = null;
    }

    /**
     * Start swarm with optional bootstrap peer to connect to directly.
     * @param {Object|null} bootstrapPeer - {ip, port} of bootstrap peer
     */
    async start(bootstrapPeer = null) {
        if (bootstrapPeer) {
            console.log(`[swarm] Received bootstrap peer: ${JSON.stringify(bootstrapPeer)}`);
        }

        this.swarm.on("connection", (socket) => this.handleConnection(socket));

        const discovery = this.swarm.join(TOPIC);
        await discovery.flushed();

        // If a bootstrap peer was found, attempt direct connection to it
        // This establishes an initial peer connection before DHT discovery
        if (bootstrapPeer && bootstrapPeer.ip) {
            console.log(`[swarm] Bootstrap peer provided: ${bootstrapPeer.ip}:${bootstrapPeer.port}`);
            console.log(`[swarm] Attempting direct connection to bootstrap peer...`);
            setTimeout(() => {
                const socket = net.createConnection(bootstrapPeer.port, bootstrapPeer.ip, () => {
                    console.log(`[swarm] ✓ Successfully connected to bootstrap peer ${bootstrapPeer.ip}`);
                    this.handleConnection(socket);
                });
                socket.setTimeout(3000);
                socket.on('error', (err) => {
                    console.log(`[swarm] ✗ Bootstrap peer connection failed: ${err.message}`);
                });
            }, 100); // Small delay to let swarm initialize
        }

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
}

module.exports = { SwarmManager };
