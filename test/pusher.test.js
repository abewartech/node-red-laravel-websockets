/**
 * Tests for node-red-laravel-websockets (pusher.js).
 * Real `pusher` / `pusher-js` modules are stubbed via require.cache so no
 * network or Pusher account is needed. Run: npm test
 */
"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");

// ---- Stubs ---------------------------------------------------------------

const createdClients = [];
const createdServers = [];

class FakeChannel extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.bound = {};
  }
  bind(event, fn) {
    this.bound[event] = fn;
    return this;
  }
}

class FakePusherClient {
  constructor(key, options) {
    this.key = key;
    this.options = options;
    this.channels = {};
    this.disconnected = false;
    createdClients.push(this);
  }
  subscribe(name) {
    const ch = new FakeChannel(name);
    this.channels[name] = ch;
    return ch;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakePusherServer {
  constructor(options) {
    this.options = options;
    this.triggers = [];
    this.shouldFail = false;
    createdServers.push(this);
  }
  trigger(channel, event, data) {
    this.triggers.push({ channel, event, data });
    if (this.shouldFail) return Promise.reject(new Error("server down"));
    return Promise.resolve({});
  }
}

// ---- Mock RED ------------------------------------------------------------

function makeRED() {
  const types = {};
  return {
    types,
    nodes: {
      createNode(node, props) {
        Object.assign(node, props);
        // Minimal Node-RED node API surface used by pusher.js
        Object.setPrototypeOf(node, EventEmitter.prototype);
        EventEmitter.call(node);
        node._sent = [];
        node._errors = [];
        node.send = (msg) => node._sent.push(msg);
        node.error = (msg) => node._errors.push(typeof msg === "string" ? msg : msg && msg.message);
        node.credentials = node._credentials || {};
      },
      registerType(name, ctor, opts) {
        types[name] = { ctor, opts };
      },
    },
  };
}

function loadModule(RED) {
  // Stub the real deps before requiring pusher.js
  const pusherPath = require.resolve("pusher");
  const clientPath = require.resolve("pusher-js/node");
  require.cache[pusherPath] = {
    id: pusherPath,
    filename: pusherPath,
    loaded: true,
    exports: FakePusherServer,
  };
  require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: FakePusherClient,
  };
  const modPath = path.join(__dirname, "..", "pusher.js");
  delete require.cache[modPath];
  const factory = require(modPath);
  factory(RED);
}

function makeNode(RED, typeName, props, credentials) {
  const { ctor } = RED.types[typeName];
  const node = { _credentials: credentials || {} };
  // createNode reads this.credentials — set before ctor runs
  node.credentials = node._credentials;
  ctor.call(node, props);
  return node;
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  createdClients.length = 0;
  createdServers.length = 0;
});

test("pusher in: subscribes and forwards payload", () => {
  const RED = makeRED();
  loadModule(RED);
  const node = makeNode(RED, "pusher in",
    { channel: "my_channel", eventname: "test_event_name", cluster: "mt1" },
    { pusherappkeysub: "key123" });

  assert.equal(createdClients.length, 1);
  const client = createdClients[0];
  assert.equal(client.key, "key123");
  assert.equal(client.options.cluster, "mt1");
  assert.equal(client.options.forceTLS, true);

  const chan = client.channels.my_channel;
  assert.ok(chan, "subscribed to my_channel");
  chan.bound.test_event_name({ payload: "hello" });
  assert.equal(node._sent.length, 1);
  assert.equal(node._sent[0].payload, "hello");
  assert.equal(node._sent[0].topic, "test_event_name");
  assert.equal(node._sent[0].channel, "my_channel");

  // Raw data without .payload wrapper passes through as-is
  chan.bound.test_event_name({ raw: 42 });
  assert.deepEqual(node._sent[1].payload, { raw: 42 });
});

test("pusher in: self-hosted wsHost uses wsPort/forceTLS, no cluster", () => {
  const RED = makeRED();
  loadModule(RED);
  makeNode(RED, "pusher in",
    { channel: "c", eventname: "e", wsHost: "127.0.0.1", wsPort: "6001", useTLS: false },
    { pusherappkeysub: "key123" });

  const client = createdClients[0];
  assert.equal(client.options.wsHost, "127.0.0.1");
  assert.equal(client.options.wsPort, 6001);
  assert.equal(client.options.forceTLS, false);
  assert.equal(client.options.cluster, undefined);
  assert.equal(client.options.disableStats, true);
});

test("pusher in: self-hosted useTLS true + bad port falls back to 6001", () => {
  const RED = makeRED();
  loadModule(RED);
  makeNode(RED, "pusher in",
    { channel: "c", eventname: "e", wsHost: "example.test", wsPort: "abc", useTLS: true },
    { pusherappkeysub: "key123" });

  const client = createdClients[0];
  assert.equal(client.options.wsHost, "example.test");
  assert.equal(client.options.wsPort, 6001);
  assert.equal(client.options.forceTLS, true);
});

test("pusher in: close disconnects the socket", () => {
  const RED = makeRED();
  loadModule(RED);
  const node = makeNode(RED, "pusher in",
    { channel: "c", eventname: "e" },
    { pusherappkeysub: "key123" });

  node.emit("close");
  assert.equal(createdClients[0].disconnected, true);
});

test("pusher in: missing app key reports an error", () => {
  const RED = makeRED();
  loadModule(RED);
  const node = makeNode(RED, "pusher in",
    { channel: "c", eventname: "e" }, {});
  assert.match(node._errors.join(" "), /No Pusher app key/);
});

test("pusher out: trigger uses config channel/event and payload", async () => {
  const RED = makeRED();
  loadModule(RED);
  const node = makeNode(RED, "pusher out",
    { channel: "my_channel", eventname: "test_event_name", cluster: "mt1" },
    { pusherappid: "1", pusherappkey: "key", pusherappsecret: "secret" });

  const server = createdServers[0];
  assert.equal(server.options.host, "127.0.0.1");
  assert.equal(server.options.port, 6001);

  node.emit("input", { payload: "hi" });
  await new Promise((r) => setImmediate(r));
  assert.equal(server.triggers.length, 1);
  assert.deepEqual(server.triggers[0], {
    channel: "my_channel",
    event: "test_event_name",
    data: { payload: "hi" },
  });
  assert.equal(node._errors.length, 0);
});

test("pusher out: msg overrides channel/eventname, msg.topic falls back", async () => {
  const RED = makeRED();
  loadModule(RED);
  const node = makeNode(RED, "pusher out",
    { channel: "cfg_channel", eventname: "cfg_event" },
    { pusherappid: "1", pusherappkey: "key", pusherappsecret: "secret" });

  const server = createdServers[0];
  node.emit("input", { payload: 1, channel: "msg_channel", eventname: "msg_event" });
  node.emit("input", { payload: 2, topic: "topic_event" });
  await new Promise((r) => setImmediate(r));
  assert.equal(server.triggers[0].channel, "msg_channel");
  assert.equal(server.triggers[0].event, "msg_event");
  assert.equal(server.triggers[1].channel, "cfg_channel");
  assert.equal(server.triggers[1].event, "topic_event");
});

test("pusher out: missing channel/event reports error, no trigger", async () => {
  const RED = makeRED();
  loadModule(RED);
  const node = makeNode(RED, "pusher out",
    { channel: "", eventname: "" },
    { pusherappid: "1", pusherappkey: "key", pusherappsecret: "secret" });

  node.emit("input", { payload: 1 });
  await new Promise((r) => setImmediate(r));
  assert.equal(createdServers[0].triggers.length, 0);
  assert.match(node._errors.join(" "), /Channel and event name/);
});

test("pusher out: trigger rejection surfaces via node.error", async () => {
  const RED = makeRED();
  loadModule(RED);
  const node = makeNode(RED, "pusher out",
    { channel: "c", eventname: "e" },
    { pusherappid: "1", pusherappkey: "key", pusherappsecret: "secret" });

  createdServers[0].shouldFail = true;
  node.emit("input", { payload: 1 });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.match(node._errors.join(" "), /Failed to trigger/);
});

test("pusher out: missing credentials report errors", () => {
  const RED = makeRED();
  loadModule(RED);
  const node = makeNode(RED, "pusher out", { channel: "c", eventname: "e" }, {});
  assert.match(node._errors.join(" "), /No Pusher app id/);
});
