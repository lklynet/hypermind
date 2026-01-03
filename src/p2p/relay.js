const relayMessage = (msg, sourceSocket, swarm, diagnostics) => {
    const data = JSON.stringify(msg) + "\n";
    const relayCount = swarm.connections.size - 1;

    if (diagnostics) {
        diagnostics.increment("bytesRelayed", data.length * relayCount);
    }

    for (const socket of swarm.connections) {
        if (socket !== sourceSocket) {
            socket.write(data);
        }
    }
}

module.exports = { relayMessage };
