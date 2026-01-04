# Troubleshooting Guide

Common issues and how to fix them.

## Node Discovery Issues

### Count stuck at 1

Your node isn't finding others on the DHT.

**Causes:**
- Running in Docker without `--network host`
- Firewall blocking UDP/TCP
- NAT not supporting hole-punching
- Corporate network restrictions

**Solutions:**

1. **Docker users**: Always use `--network host`:
   ```bash
   docker run --network host -e PORT=3000 ghcr.io/lklynet/hypermind:latest
   ```

2. **Check firewall**: Hyperswarm needs UDP + TCP access to random high ports

3. **Use TCP relay for local testing**:
   ```bash
   # Terminal 1
   node relay-server.js

   # Terminal 2
   RELAY_PORT=4000 PORT=3000 node server.js

   # Terminal 3
   RELAY_PORT=4000 PORT=3001 node server.js
   ```

### No direct connections (direct: 0)

You're seeing peers but not directly connected to any.

**Cause:** All peers are discovered through gossip relay, not DHT.

**Solution:** This is normal if you have a strict NAT. As long as `count` is > 1, the network is working.

## Chat Issues

### Chat not visible

**Cause:** Chat is disabled by default.

**Solution:** Enable it with the environment variable:
```bash
ENABLE_CHAT=true PORT=3000 npm start
```

### Chat messages not sending

**Causes:**
- Rate limited (2s cooldown, max 5 messages per 30s)
- Not connected to any peers
- Message too long (max 140 chars)

**Solutions:**
1. Wait for the cooldown timer in the UI
2. Check that `direct` > 0 in stats
3. Keep messages under 140 characters

### Chat messages not received

**Cause:** Nodes aren't connected to each other.

**Solution:** Use TCP relay for reliable local testing:
```bash
RELAY_PORT=4000 ENABLE_CHAT=true PORT=3000 node server.js
```

## Dashboard Issues

### Dashboard won't load

**Causes:**
- Wrong port
- Node crashed
- Port already in use

**Solutions:**
1. Check the console output for the actual port
2. Check for errors in terminal
3. Try a different port: `PORT=3001 npm start`

### Count not updating

**Cause:** SSE connection dropped.

**Solution:** Refresh the page. SSE auto-reconnects, but sometimes a refresh helps.

### Diagnostics modal empty

**Cause:** Metrics haven't been collected yet.

**Solution:** Wait 10 seconds for the first diagnostics interval.

## Performance Issues

### High memory usage

**Cause:** Too many peers tracked.

**Solution:** Lower the max peers limit:
```bash
MAX_PEERS=10000 npm start
```

### High CPU usage

**Causes:**
- Proof-of-Work mining at startup (normal, lasts ~1 second)
- Processing many messages

**Solution:** If CPU stays high after startup, check for message floods in diagnostics.

## Docker Issues

### Container exits immediately

**Causes:**
- Missing `--network host`
- Port conflict

**Solutions:**
```bash
# Correct way
docker run --network host -e PORT=3000 ghcr.io/lklynet/hypermind:latest

# Check logs
docker logs hypermind
```

### Can't access dashboard from other machines

**Cause:** Firewall on host machine.

**Solution:** Open the port (e.g., 3000) in your host firewall.

## Development Issues

### Environment variables not working with npm

**Cause:** Some shells don't pass env vars through npm.

**Solution:** Run node directly:
```bash
# Instead of
PORT=3000 npm start

# Use
PORT=3000 node server.js
```

### Tests failing

**Cause:** Node version mismatch.

**Solution:** Use Node.js 18 or later:
```bash
node --version  # Should be v18+
```

## Diagnostic Commands

Check if your node is healthy:

```bash
# Get stats
curl http://localhost:3000/api/stats | jq

# Expected output:
{
  "count": 42,
  "totalUnique": 150,
  "direct": 5,
  "id": "302a...",
  "diagnostics": { ... }
}
```

Key metrics to check:
- `count`: Should be > 1 if network is healthy
- `direct`: Should be > 0 for best performance
- `diagnostics.invalidPoW`: Should be low (< 10% of heartbeats)
- `diagnostics.invalidSig`: Should be 0

## Getting Help

If none of the above helps:

1. Check the [GitHub Issues](https://github.com/lklynet/hypermind/issues)
2. Open a new issue with:
   - Your environment (OS, Node version, Docker version)
   - Output of `curl http://localhost:3000/api/stats`
   - Any error messages from the console
