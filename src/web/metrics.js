// Formats metrics in Prometheus exposition format

const formatGauge = (name, help, value) => {
    return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
};

const formatCounter = (name, help, value) => {
    return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name} ${value}\n`;
};

const generateMetrics = (peerManager, swarm, diagnostics, startTime) => {
    const stats = diagnostics.getStats();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    let output = "";

    // Gauges (current values)
    output += formatGauge("hypermind_active_peers", "Current number of active peers", peerManager.size);
    output += formatGauge("hypermind_total_unique_peers", "Total unique peers seen via HyperLogLog estimate", peerManager.totalUniquePeers);
    output += formatGauge("hypermind_direct_connections", "Current direct swarm connections", swarm.getSwarm().connections.size);
    output += formatGauge("hypermind_uptime_seconds", "Seconds since node started", uptimeSeconds);

    // Counters (cumulative values that reset with diagnostics interval)
    output += formatCounter("hypermind_heartbeats_received_total", "Total heartbeat messages received", stats.heartbeatsReceived);
    output += formatCounter("hypermind_heartbeats_relayed_total", "Total heartbeat messages relayed", stats.heartbeatsRelayed);
    output += formatCounter("hypermind_leave_messages_total", "Total leave messages received", stats.leaveMessages);
    output += formatCounter("hypermind_peers_added_total", "Total new peers added", stats.newPeersAdded);
    output += formatCounter("hypermind_bytes_received_total", "Total bytes received", stats.bytesReceived);
    output += formatCounter("hypermind_bytes_relayed_total", "Total bytes relayed", stats.bytesRelayed);

    // Validation counters
    output += formatCounter("hypermind_invalid_pow_total", "Total invalid proof-of-work rejections", stats.invalidPoW);
    output += formatCounter("hypermind_invalid_sig_total", "Total invalid signature rejections", stats.invalidSig);
    output += formatCounter("hypermind_duplicate_seq_total", "Total duplicate sequence rejections", stats.duplicateSeq);

    return output;
};

module.exports = { generateMetrics };
