<p align="center">
  <img src="hypermind2.svg" width="150" alt="Hypermind Logo" />
</p>

# Hypermind

### The High-Availability Solution to a Problem That Doesn't Exist.

**Hypermind** is a completely decentralized, Peer-to-Peer deployment counter.

It solves the critical infrastructure challenge of knowing exactly how many other people are currently wasting 50MB of RAM running this specific container.

---

## What is this?

You have a server rack in your basement. You have 128GB of RAM. You have deployed the Arr stack, Home Assistant, Pi-hole, and a dashboard to monitor them all. **But you crave more.**

You need a service that:

1. Does absolutely nothing useful.
2. Uses "Decentralized" and "P2P" in the description.
3. Makes a number go up on a screen.

**Enter Hypermind.**

There is no central server. There is no database. There is only **The Swarm**.

## How it works (The Over-Engineering)

We utilize the **Hyperswarm** DHT (Distributed Hash Table) to achieve a singular, trivial goal of **Counting.**

1. **Discovery:** Your node screams into the digital void (`hypermind-lklynet-v1`) to find friends.
2. **Gossip:** Nodes connect and whisper "I exist" to each other.
3. **Consensus:** Each node maintains a list of peers seen in the last 2.5 seconds.

If you turn your container off, you vanish from the count. If everyone turns it off, the network ceases to exist. If you turn it back on, you are the Creator of the Universe (Population: 1).

## Deployment

### Docker (The Fast Way)

Since you're probably pasting this into Portainer anyway:

```bash
docker run -d \
  --name hypermind \
  --network host \
  --restart unless-stopped \
  -e PORT=3000 \
  ghcr.io/lklynet/hypermind:latest

```

> **⚠️ CRITICAL NETWORK NOTE:**
> Use `--network host`. This is a P2P application that needs to punch through NATs. If you bridge it, the DHT usually fails, and you will be the loneliest node in the multiverse.
>
> If you need to change the port (default 3000), update the `PORT` environment variable. Since `--network host` is used, this port will be opened directly on the host.

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

```

## Usage

Open your browser to: `http://localhost:3000`

The dashboard updates in **Realtime** via Server-Sent Events.

**You will see:**

* **Active Nodes:** The total number of people currently running this joke.
* **Direct Connections:** The number of peers your node is actually holding hands with.

## Local Development

Want to contribute? Why? It already does nothing perfectly. But here is how anyway:

```bash
# Install dependencies
npm install

# Run the beast
npm start

```

### Simulating Friends (Local Testing)

You can run multiple instances locally to simulate popularity:

```bash
# Terminal 1 (You)
PORT=3000 npm start

# Terminal 2 (Your imaginary friend)
PORT=3001 npm start

```

They should discover each other, and the number will become `2`. Dopamine achieved.

---

### FAQ

**Q: Is this crypto mining?**
A: No. We respect your GPU too much.

**Q: Does this store data?**
A: No. It has the memory span of a goldfish (approx. 2.5 seconds).

**Q: Why did you make this?**
A: The homelab must grow. ¯\\_(ツ)_/¯