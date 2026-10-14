<!-- GitAds-Verify: 63T8162YTDTAJ66CR1PQ7E75CWTNPYKW -->

## GitAds Sponsored
[![Sponsored by GitAds](https://gitads.dev/v1/ad-serve?source=abewartech/node-red-laravel-websockets@github)](https://gitads.dev/v1/ad-track?source=abewartech/node-red-laravel-websockets@github)



node-red-laravel-websockets
====================

A <a href="http://nodered.org" target="_new">Node-RED</a> node to send and receive messages using [Laravel WebSockets](https://github.com/beyondcode/laravel-websockets) (self-hosted, Pusher-compatible) or Pusher cloud.

Two nodes:

| Node | Direction | What it does |
| --- | --- | --- |
| `pusher in` | Subscribe | Listens to a channel/event, outputs one message per received event |
| `pusher out` | Publish | Sends `msg.payload` to a channel/event on each input message |

Install
-------

Run the following command in your Node-RED user directory - typically `~/.node-red`

        npm install node-red-laravel-websockets

Then restart Node-RED. The nodes appear in the palette as `pusher in` / `pusher out`.

Self-hosted Laravel WebSockets (default use case)
---------------------------------------------------

Point the nodes at your own server (default `127.0.0.1:6001`, plain `ws`):

- **`pusher in`**: set **WS Host** (e.g. `127.0.0.1`) and **WS Port** (default `6001`). Leave **WS Host** empty to use Pusher cloud via **Cluster** instead. Tick **Use TLS (wss)** only if your server terminates TLS.
- **`pusher out`**: sends to `127.0.0.1:6001` with TLS off. Use the same App ID / Key / Secret as your Laravel WebSockets server config.

Pusher cloud works too: leave WS Host empty on `pusher in` and pick the matching **Cluster** on both nodes.

Message overrides (`pusher out`)
---------------------------------

Per-message fields override the node config:

| `msg` field | Effect |
| --- | --- |
| `msg.channel` | Channel to publish to (falls back to configured channel) |
| `msg.eventname` | Event name (falls back to `msg.topic`, then configured event) |
| `msg.topic` | Event name fallback (as documented in the editor help) |
| `msg.payload` | Payload sent as `{ payload: msg.payload }` |

If neither config nor message provides a channel and event name, the node reports an error and sends nothing. A failed publish (e.g. server down) is reported via `node.error` instead of an unhandled rejection.

Example flow
------------

`examples/laravel-websockets-echo.json` — import via Menu → Import → Examples. It sends a message with `pusher out` to a local Laravel WebSockets server and receives it back with `pusher in` (WS Host `127.0.0.1`, port `6001`) on the same channel/event.

Development
-----------

        npm test   # node:test suite, mocked RED runtime — no Pusher account needed

CI runs the suite on Node 20 and 22.
