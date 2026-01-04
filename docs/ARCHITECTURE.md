# Hypermind Architecture

This document explains how Hypermind works under the hood, for developers who want to contribute or understand the system.

## Overview

Hypermind is a decentralized peer counter built on [Hyperswarm](https://github.com/holepunchto/hyperswarm), a DHT-based peer discovery network. Nodes discover each other, exchange heartbeats, and maintain a local count of active peers.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Node                                │
├─────────────┬─────────────┬─────────────┬───────────────────────┤
│   Identity  │   P2P Layer │    State    │      Web Layer        │
│  (Ed25519)  │  (Swarm)    │  (Peers)    │   (Express + SSE)     │
└─────────────┴─────────────┴─────────────┴───────────────────────┘
        │              │            │                │
        └──────────────┴────────────┴────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Hyperswarm DHT  │
                    │  (The Internet)   │
                    └───────────────────┘
```

## Directory Structure

```
hypermind/
├── server.js                 # Entry point - wires everything together
├── relay-server.js           # TCP relay for local testing
├── src/
│   ├── config/
│   │   └── constants.js      # All configuration values
│   ├── core/
│   │   ├── identity.js       # Ed25519 keypair + PoW mining
│   │   └── security.js       # Signature verification
│   ├── p2p/
│   │   ├── swarm.js          # Hyperswarm connection management
│   │   ├── messaging.js      # Message validation & handlers
│   │   └── relay.js          # Gossip message forwarding
│   ├── state/
│   │   ├── peers.js          # Peer tracking (LRU + HyperLogLog)
│   │   ├── bloom.js          # Deduplication filter
│   │   ├── diagnostics.js    # Metrics collection
│   │   ├── ratelimit.js      # Chat rate limiting
│   │   ├── lru.js            # LRU cache implementation
│   │   └── hyperloglog.js    # Cardinality estimator
│   └── web/
│       ├── server.js         # Express app factory
│       ├── routes.js         # HTTP endpoints
│       └── sse.js            # Server-Sent Events manager
└── public/
    ├── index.html            # Dashboard template
    ├── app.js                # Frontend JavaScript
    └── style.css             # Styling
```

## Startup Flow

When you run `npm start`:

1. **Generate Identity**: Create Ed25519 keypair, mine a Proof-of-Work nonce
2. **Initialize Managers**: PeerManager, DiagnosticsManager, SSEManager
3. **Add Self**: Register this node in the peer list
4. **Start Swarm**: Join the Hyperswarm DHT topic
5. **Begin Heartbeat Loop**: Announce presence every 5 seconds
6. **Start Web Server**: Listen for HTTP connections

## Core Components

### Identity (`src/core/identity.js`)

Each node generates a unique Ed25519 keypair at startup. The public key (in DER format, hex-encoded) becomes the node's identity.

A Proof-of-Work nonce is mined by finding a number that, when combined with the identity and hashed with SHA-256, produces a hash starting with `0000`. This makes creating fake identities computationally expensive.

### Swarm Manager (`src/p2p/swarm.js`)

Manages connections to other nodes:

- **Discovery**: Joins the DHT topic `sha256("hypermind-lklynet-v1")`
- **Heartbeat**: Sends HEARTBEAT messages every 5 seconds
- **Connection Rotation**: Prevents hoarding connections (max 32, rotates oldest)
- **Graceful Shutdown**: Sends LEAVE message to all peers before exit

### Peer Manager (`src/state/peers.js`)

Tracks known peers:

- **LRU Cache**: Stores up to 1 million peers, evicts least-recently-seen
- **Stale Cleanup**: Removes peers not seen in 15 seconds
- **HyperLogLog**: Estimates total unique peers ever seen (~3% error)

### Message Handler (`src/p2p/messaging.js`)

Validates and processes incoming messages:

1. Parse JSON
2. Validate message structure
3. Verify Proof-of-Work
4. Check sequence number (prevent replays)
5. Verify Ed25519 signature
6. Update peer state
7. Relay to other peers (if not already seen)

### Bloom Filter (`src/state/bloom.js`)

Prevents relaying the same message multiple times:

- Two rotating filters (current + previous)
- Rotates every 30 seconds
- Messages are only relayed if not in either filter

## Message Protocol

All messages are newline-delimited JSON sent over TCP connections.

### HEARTBEAT

Sent every 5 seconds to announce "I'm alive":

```json
{
  "type": "HEARTBEAT",
  "id": "302a300506032b6570...",
  "seq": 42,
  "hops": 0,
  "nonce": 12345,
  "sig": "a1b2c3..."
}
```

- `seq`: Incrementing counter (for replay protection)
- `hops`: How many relays this message has passed through
- `sig`: Signature of `seq:42`

### LEAVE

Sent on graceful shutdown:

```json
{
  "type": "LEAVE",
  "id": "302a300506032b6570...",
  "hops": 0,
  "sig": "a1b2c3..."
}
```

- `sig`: Signature of `type:LEAVE:${id}`

### CHAT

Ephemeral chat message (when enabled):

```json
{
  "type": "CHAT",
  "id": "302a300506032b6570...",
  "nick": "alice",
  "msg": "hello world",
  "ts": 1704326400000,
  "hops": 0,
  "nonce": 12345,
  "sig": "a1b2c3..."
}
```

- `nick`: Optional nickname (max 16 chars)
- `msg`: Message content (max 140 chars)
- `ts`: Timestamp for deduplication
- `sig`: Signature of `chat:${msg}:${ts}`

## Gossip Relay

Messages propagate through the network via gossip:

1. Node A sends HEARTBEAT to Node B
2. Node B validates, updates state
3. Node B increments `hops` and forwards to Nodes C, D, E...
4. Each node only relays if `hops < 2` and not in bloom filter

This ensures messages reach the entire network without flooding.

## Web Dashboard

The dashboard (`public/index.html`) shows:

- **Active Nodes**: Current peer count
- **Direct Connections**: Peers you're directly connected to
- **Particle Visualization**: Animated particles representing peers
- **Diagnostics Modal**: Detailed metrics
- **Peer Map**: Geographic visualization (when enabled)
- **Chat Terminal**: Ephemeral P2P chat (when enabled)

Updates arrive via Server-Sent Events (SSE) at `/events`.

## Configuration

All tunable values are in `src/config/constants.js`:

| Constant | Default | Description |
|----------|---------|-------------|
| `HEARTBEAT_INTERVAL` | 5000ms | How often to announce |
| `PEER_TIMEOUT` | 15000ms | When to consider a peer stale |
| `MAX_CONNECTIONS` | 32 | Maximum direct connections |
| `MAX_PEERS` | 1000000 | Maximum peers to track |
| `MAX_RELAY_HOPS` | 2 | Maximum gossip relay depth |

## Security

- **Identity**: Ed25519 keypairs (cryptographically secure)
- **Proof-of-Work**: Prevents Sybil attacks
- **Signatures**: All messages are signed
- **Replay Protection**: Sequence numbers prevent replay attacks
- **No Persistence**: Nothing is stored; restart = fresh start

## Contributing

When modifying the codebase:

1. **Don't change the TOPIC hash** - This would isolate your node
2. **Don't change the POW_PREFIX** - Would cause network split
3. **Don't change signature formats** - Would break message validation
4. **Test with 2+ nodes locally** before submitting changes

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
