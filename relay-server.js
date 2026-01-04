const net = require("net");

// Simple TCP relay server for local testing
// All connected clients receive all messages from other clients

const clients = new Set();

const server = net.createServer((socket) => {
    console.log("Client connected");
    clients.add(socket);

    socket.on("data", (data) => {
        // Relay to all other clients
        for (const client of clients) {
            if (client !== socket && !client.destroyed) {
                client.write(data);
            }
        }
    });

    socket.on("close", () => {
        console.log("Client disconnected");
        clients.delete(socket);
    });

    socket.on("error", () => {
        clients.delete(socket);
    });
});

const PORT = process.env.RELAY_PORT || 4000;
server.listen(PORT, "127.0.0.1", () => {
    console.log(`TCP Relay server running on 127.0.0.1:${PORT}`);
    console.log(`Start nodes with: RELAY_PORT=${PORT} PORT=3000 npm start`);
});
