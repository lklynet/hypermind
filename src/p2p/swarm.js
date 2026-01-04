const Hyperswarm = require("hyperswarm");
const net = require("net");
const { signMessage } = require("../core/security");
const { TOPIC, HEARTBEAT_INTERVAL, MAX_CONNECTIONS, CONNECTION_ROTATION_INTERVAL, ENABLE_CHAT } = require("../config/constants");

// TCP Relay port for local testing (bypasses DHT issues on WSL2)
const RELAY_PORT = process.env.RELAY_PORT ? parseInt(process.env.RELAY_PORT) : null;

class SwarmManager {
    constructor(identity, peerManager, diagnostics, messageHandler, relayFn, broadcastFn, chatSystemFn) {
        this.identity = identity;
        this.peerManager = peerManager;
        this.diagnostics = diagnostics;
        this.messageHandler = messageHandler;
        this.relayFn = relayFn;
        this.broadcastFn = broadcastFn;
        this.chatSystemFn = chatSystemFn;
        this.relaySocket = null; // TCP relay socket for local testing
        this.extraConnections = new Set(); // Additional connections (relay)

        this.swarm = new Hyperswarm();
        this.heartbeatInterval = null;
        this.rotationInterval = null;
    }

    async start() {
        this.swarm.on("connection", (socket) => this.handleConnection(socket));

        // If using TCP relay, connect to it instead of DHT discovery
        if (RELAY_PORT) {
            console.log(`Connecting to TCP relay at 127.0.0.1:${RELAY_PORT}`);
            this.connectToRelay();
        } else {
            const discovery = this.swarm.join(TOPIC);
            await discovery.flushed();
        }

        this.startHeartbeat();
        this.startRotation();
    }

    connectToRelay() {
        const socket = net.createConnection({ host: '127.0.0.1', port: RELAY_PORT }, () => {
            console.log("Connected to TCP relay server");
            this.relaySocket = socket;
            this.extraConnections.add(socket);
            
            // Send initial heartbeat
            const sig = signMessage(`seq:${this.peerManager.getSeq()}`, this.identity.privateKey);
            const hello = JSON.stringify({
                type: "HEARTBEAT",
                id: this.identity.id,
                seq: this.peerManager.getSeq(),
                hops: 0,
                nonce: this.identity.nonce,
                sig,
            }) + "\n";
            socket.write(hello);
            this.broadcastFn();
        });

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
            console.log("TCP relay connection closed, reconnecting...");
            this.extraConnections.delete(socket);
            this.relaySocket = null;
            // Reconnect after 1 second
            setTimeout(() => this.connectToRelay(), 1000);
        });

        socket.on("error", (err) => {
            console.error("TCP relay error:", err.message);
        });
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

            // Send to all Hyperswarm connections
            for (const socket of this.swarm.connections) {
                socket.write(heartbeat);
            }
            
            // Also send to relay/extra connections
            for (const socket of this.extraConnections) {
                if (!socket.destroyed) {
                    socket.write(heartbeat);
                }
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
        
        // Send to all Hyperswarm connections
        for (const socket of this.swarm.connections) {
            socket.write(msgStr);
        }
        
        // Also send to relay/extra connections
        for (const socket of this.extraConnections) {
            if (!socket.destroyed) {
                socket.write(msgStr);
            }
        }
    }

    // Get all connections (Hyperswarm + relay)
    getAllConnections() {
        const all = new Set(this.swarm.connections);
        for (const socket of this.extraConnections) {
            if (!socket.destroyed) {
                all.add(socket);
            }
        }
        return all;
    }
}

module.exports = { SwarmManager };
