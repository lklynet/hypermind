# API Reference

Hypermind exposes a simple HTTP API for monitoring and integration.

## Endpoints

### GET `/`

Returns the HTML dashboard.

### GET `/api/stats`

Returns current node statistics as JSON.

**Response:**

```json
{
  "count": 42,
  "totalUnique": 150,
  "direct": 5,
  "id": "302a300506032b6570032100...",
  "diagnostics": {
    "heartbeatsReceived": 100,
    "heartbeatsRelayed": 80,
    "invalidPoW": 0,
    "duplicateSeq": 5,
    "invalidSig": 0,
    "newPeersAdded": 3,
    "bytesReceived": 15000,
    "bytesRelayed": 12000,
    "leaveMessages": 1
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | number | Current active peer count |
| `totalUnique` | number | Estimated total unique peers ever seen |
| `direct` | number | Number of direct connections |
| `id` | string | This node's identity (hex-encoded public key) |
| `diagnostics` | object | Metrics from the last 10-second interval |

**Diagnostics Fields:**

| Field | Description |
|-------|-------------|
| `heartbeatsReceived` | HEARTBEAT messages received |
| `heartbeatsRelayed` | Messages forwarded to other peers |
| `invalidPoW` | Messages rejected for bad Proof-of-Work |
| `duplicateSeq` | Messages rejected for stale sequence number |
| `invalidSig` | Messages rejected for bad signature |
| `newPeersAdded` | New unique peers discovered |
| `bytesReceived` | Total bytes received |
| `bytesRelayed` | Total bytes forwarded |
| `leaveMessages` | LEAVE messages processed |

### GET `/events`

Server-Sent Events stream for real-time updates.

**Event Format:**

```
data: {"count":42,"totalUnique":150,"direct":5,...}

data: {"type":"CHAT","sender":"302a...","nick":"alice","content":"hello","timestamp":1704326400000}

data: {"type":"SYSTEM","content":"Connection established with Node ...abc12345","timestamp":1704326400000}
```

**Event Types:**

1. **Stats Update**: Regular payload with `count`, `direct`, etc.
2. **Chat Message**: Has `type: "CHAT"` with message content
3. **System Message**: Has `type: "SYSTEM"` for connect/disconnect events

**Usage Example (JavaScript):**

```javascript
const events = new EventSource('/events');

events.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'CHAT') {
    console.log(`${data.nick || data.sender}: ${data.content}`);
  } else if (data.type === 'SYSTEM') {
    console.log(`[SYSTEM] ${data.content}`);
  } else {
    console.log(`Peers: ${data.count}, Direct: ${data.direct}`);
  }
};
```

### POST `/api/chat`

Send a chat message (requires `ENABLE_CHAT=true`).

**Request:**

```json
{
  "msg": "Hello, swarm!",
  "nick": "alice"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `msg` | string | Yes | Message content (max 140 chars) |
| `nick` | string | No | Nickname (max 16 chars, alphanumeric) |

**Response (Success):**

```json
{
  "success": true
}
```

**Response (Rate Limited):**

```json
{
  "error": "Rate limited. Please wait."
}
```

**Response (Chat Disabled):**

```json
{
  "error": "Chat is disabled"
}
```

**Rate Limits:**
- Minimum 2 seconds between messages
- Maximum 5 messages per 30-second window

## Integration Examples

### Homepage Dashboard Widget

Add to your `services.yaml`:

```yaml
- Hypermind:
    icon: /icons/hypermind2.png
    href: http://YOUR_IP:3000
    widget:
      type: customapi
      url: http://YOUR_IP:3000/api/stats
      method: GET
      mappings:
        - field: count
          label: Swarm Size
        - field: direct
          label: Direct Peers
```

### Home Assistant Sensor

```yaml
sensor:
  - platform: rest
    name: Hypermind Swarm Size
    resource: http://YOUR_IP:3000/api/stats
    value_template: "{{ value_json.count }}"
    json_attributes:
      - direct
      - totalUnique
    scan_interval: 30
```

### Shell Script Monitoring

```bash
#!/bin/bash
while true; do
  stats=$(curl -s http://localhost:3000/api/stats)
  count=$(echo $stats | jq .count)
  direct=$(echo $stats | jq .direct)
  echo "$(date): Peers=$count Direct=$direct"
  sleep 10
done
```

### Python Integration

```python
import requests
import sseclient

# One-time stats fetch
stats = requests.get('http://localhost:3000/api/stats').json()
print(f"Current peers: {stats['count']}")

# Real-time monitoring
response = requests.get('http://localhost:3000/events', stream=True)
client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"Peers: {data.get('count', 'N/A')}")
```
