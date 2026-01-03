const Hyperswarm = require("hyperswarm");
const { signMessage } = require("../core/security");
const { TOPIC, TOPIC_NAME, HEARTBEAT_INTERVAL } = require("../config/constants");

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
    }

    async start() {
        this.swarm.on("connection", (socket) => this.handleConnection(socket));

        const discovery = this.swarm.join(TOPIC);
        await discovery.flushed();

        this.startHeartbeat();
    }

    handleConnection(socket) {
        const sig = signMessage(`seq:${this.peerManager.getSeq()}`, this.identity.privateKey);
        const hello = JSON.stringify({
            type: "HEARTBEAT",
            id: this.identity.id,
            seq: this.peerManager.getSeq(),
            hops: 0,
            nonce: this.identity.nonce,
            sig,
            availableRAM: this.peerManager.getAvailableRAM(),
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
            const currentRAM = this.peerManager.getAvailableRAM();
            this.peerManager.addOrUpdatePeer(this.identity.id, seq, null, currentRAM);

            const sig = signMessage(`seq:${seq}`, this.identity.privateKey);
            const heartbeat = JSON.stringify({
                type: "HEARTBEAT",
                id: this.identity.id,
                seq,
                hops: 0,
                nonce: this.identity.nonce,
                sig,
                availableRAM: currentRAM,
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

        setTimeout(() => {
            process.exit(0);
        }, 500);
    }

    getSwarm() {
        return this.swarm;
    }
}

module.exports = { SwarmManager };
