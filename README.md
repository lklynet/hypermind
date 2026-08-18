<div align="center">
<img src="public/hypernode.svg" width="150" alt="Hypermind Logo" />
<h1>Hypermind</h1>
</div>

[![VirusTotal](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/lklynet/hypermind/main/.github/badges/virustotal.json)](https://github.com/lklynet/hypermind/actions/workflows/virustotal.yml)

### The High-Availability Solution to a Problem That Doesn't Exist.

**Hypermind** is a completely decentralized, Peer-to-Peer deployment counter and ephemeral chat platform.

It solves the critical infrastructure challenge of knowing exactly how many other people are currently wasting ~~50MB of~~ RAM running this specific container, while providing a secure, serverless way to say "hello" to them.

---

## Special Announcement

Apparently the counter was not enough.

[Hypermind-Swarm](https://github.com/lklynet/hypermind-swarm) is a fork of Hypermind that takes the same P2P bones and turns them into a Twitter-style social platform for decentralized, ephemeral conversations.

It is built by the same creator, still allergic to central servers, still running on the swarm, and now aimed at letting people post into the void without algorithms, permanent digital footprints, or anyone pretending this needed to exist.

---

## What is this?

You need a service that:

1.  **Does absolutely nothing useful.**
2.  **Uses "Decentralized" and "P2P" in the description.**
3.  **Makes a number go up on a screen.**

**Enter Hypermind.**

There is no central server. There is no database. There is only **The Swarm**.

## How it works

We utilize the **Hyperswarm** DHT (Distributed Hash Table) to create a mesh network of useless nodes.

1.  **Discovery:** Your node screams into the digital void to find friends.
2.  **Gossip:** Nodes connect and whisper "I exist" to each other.
3.  **State:**
    *   **Active Count:** Maintained via a distributed LRU cache of peers seen in the last 45 seconds.
    *   **Total History:** Uses a **HyperLogLog** probabilistic data structure to estimate total unique peers with >98% accuracy.
4.  **Chaos:** Connections are rotated every 5 minutes to ensure a dynamic, unblockable topology.

## Features

### 1. The Counter
It counts. That's the main thing.
*   **Active Nodes:** Real-time count of currently online peers.
*   **Total Unique:** A probabilistic estimate of every unique node ever encountered.

### 2. Ephemeral Chat
A completely decentralized chat system built directly on top of the swarm topology.
*   **Modes:** Local (direct neighbors) and Global (gossip relay).
*   **Ephemeral:** No database. No history.
*   **Markdown:** Full support for rich text.

### 3. Visualizations
*   **Particle Map:** Visualizes approximate peer locations (if enabled).
*   **Themes:** Built-in theme switcher (Hypermind, Hypermind Classic, Nord, Solarized, Tokyo Night, etc).

    <img src="assets/images/hypermind-theme.png" width="100" alt="Hypermind" /> <img src="assets/images/hypermind-classic-theme.png" width="100" alt="Hypermind Classic" /> <img src="assets/images/nord-dark-theme.png" width="100" alt="Nord" /> <img src="assets/images/solarized-light-theme.png" width="100" alt="Solarized" /><br>
    <img src="assets/images/tokyo-night-theme.png" width="100" alt="Tokyo Night" /> <img src="assets/images/volcano-theme.png" width="100" alt="Volcano" /> <img src="assets/images/catppuccin-mocha-theme.png" width="100" alt="Catppuccin Mocha" /> <img src="assets/images/catppuccin-latte-theme.png" width="100" alt="Catppuccin Latte" /><br>
    <img src="assets/images/dracula-theme.png" width="100" alt="Dracula" /> <img src="assets/images/alucard-theme.png" width="100" alt="Alucard" />

---

## Usage

### Dashboard
Open `http://localhost:3000`. The dashboard updates in **Realtime** via Server-Sent Events.

### Chat Commands
*   `/help` - Show all commands.
*   `/local <msg>` - Send message only to direct connections.
*   `/whisper <user> <msg>` - Send a private message.
*   `/block <user>` - Block a user.
*   `/timestamp` - Toggle message timestamps.
*   `/sound` - Toggle sound effects for sent/received messages.
*   **Easter Eggs:** `/shrug`, `/tableflip`, `/heart`, and more.

---

<details>
<summary><strong>Deployment</strong></summary>

### Docker


```bash
docker run -d \
  --name hypermind \
  --network host \
  --restart unless-stopped \
  -e PORT=3000 \
  -e ENABLE_CHAT=true \
  -e ENABLE_MAP=true \
  ghcr.io/lklynet/hypermind:latest
```

> **⚠️ CRITICAL NETWORK NOTE:**
> Use `--network host`. This is a P2P application that needs to punch through NATs. If you bridge it, the DHT usually fails, and you will be the loneliest node in the multiverse.

### Docker Compose (The Classy Way)

Add this to your `docker-compose.yml` to permanently reserve system resources for no reason:

```yaml
services:
  hypermind:
    image: ghcr.io/lklynet/hypermind:latest
    container_name: hypermind
    network_mode: host
    restart: unless-stopped
    environment:
      - PORT=3000
      - ENABLE_CHAT=true
      - ENABLE_MAP=true
```

### Kubernetes (The Enterprise Way)

For when you need your useless counter to be orchestrated by a control plane.

```bash
kubectl create deployment hypermind --image=ghcr.io/lklynet/hypermind:latest --port=3000
kubectl set env deployment/hypermind PORT=3000 ENABLE_CHAT=true
kubectl expose deployment hypermind --type=LoadBalancer --port=3000 --target-port=3000
```

</details>

<details>
<summary><strong>Environment Variables</strong></summary>

Hypermind is highly configurable. Use these variables to tune your experience.

### Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CHAT` | `false` | Set to `true` to enable the P2P chat system. |
| `ENABLE_MAP` | `false` | Set to `true` to enable the map visualization. |
| `ENABLE_THEMES` | `true` | Set to `false` to disable the theme switcher. |
| `VISUAL_LIMIT` | `500` | Max number of particles to render on the dashboard. |

### Network Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | The web dashboard port. |
| `MAX_PEERS` | `50000` | Max peers to track in LRU cache. |
| `MAX_CONNECTIONS` | `15` | Max active TCP/UTP connections. |
| `MAX_RELAY_HOPS` | `5` | How far a global chat message travels (TTL). |
| `PEER_TIMEOUT` | `45000` | ms before a silent peer is considered offline. |

</details>

<details>
<summary><strong>Integrations</strong></summary>

The community has bravely stepped up to integrate Hypermind into critical monitoring infrastructure.

### Home Assistant

Do you want your living room lights to turn red when the swarm grows? Of course you do.

The [Hypermind HA Integration](https://github.com/synssins/hypermind-ha) (installable via HACS) provides:

*   **RGB Control:** 0 nodes = Green. 10,000 nodes = Red.
*   **Sensors:** Swarm health checks and statistics logging.
*   **WLED Support:** Visualize the swarm size on a literal LED strip.

### Homepage Dashboard

If it's not on your dashboard, does it even exist? You can query the `/api/stats` endpoint to add a widget to [gethomepage/homepage](https://gethomepage.dev/).

Add this to your `services.yaml`:

```yaml
- Hypermind:
    icon: /icons/hypermind2.png
    href: http://<YOUR_IP>:3000
    widget:
      type: customapi
      url: http://<YOUR_IP>:3000/api/stats
      method: GET
      mappings:
        - field: count
          label: Active
        - field: totalUnique
          label: All Time
```

To get the icon to work, you have to add the icon to `/app/public/icons`. See detailed [instructions](https://gethomepage.dev/configs/services/#icons).


### API Documentation

For developers who are not satisfied in just looking a number on the screen but are craving to add new features, a comprehensive development API documentation is available in [`devdocs/API.md`](devdocs/API.md).

**Available Endpoints:**
- `GET /api/stats` - Current node statistics
- `POST /api/chat` - Send P2P chat messages
- `GET /api/github/latest-release` - Latest release information
- `GET /events` - Server-Sent Events stream for real-time updates
- `GET /js/lists.js` - Dynamic adjectives/nouns for screenname generation
- `GET /js/screenname.js` - Screenname generation logic
- `GET /` - Main HTML page

The documentation includes security best practices, rate limiting guidelines, modular route structure, and examples for creating new endpoints.

</details>

<details>
<summary><strong>Local Development</strong></summary>

Want to contribute? Why? It already does nothing perfectly. But here is how anyway:

```bash
# Install dependencies
npm install

# Run the beast
npm start
```

### Simulating a Swarm
You can run multiple instances locally to simulate popularity:

```bash
# Terminal 1
PORT=3000 npm start

# Terminal 2
PORT=3001 npm start
```

They will discover each other via the local network DHT, and the number will become `2`. Dopamine achieved.

</details>

---

## FAQ

**Q: Is this crypto mining?**
A: No. We respect your GPU too much.

**Q: Does this store data?**
A: No. It has the short-term working memory of a honeybee (approx. 45 seconds).

**Q: Why did you make this?**
A: The homelab must grow. ¯\\_(ツ)_/¯

## Star History

<a href="https://star-history.dera.page/#lklynet/hypermind&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=lklynet/hypermind&type=timeline&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=lklynet/hypermind&type=timeline" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=lklynet/hypermind&type=timeline" />
 </picture>
</a>
