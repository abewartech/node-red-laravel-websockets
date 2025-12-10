module.exports = function (RED) {
  "use strict";
  var Pusher = require("pusher");
  // Use the maintained pusher-js client for subscriptions in Node-RED runtime
  var PusherClient = require("pusher-js/node");

  // node for subscribing to an event/channel
  function PusherNode(n) {
    RED.nodes.createNode(this, n);
    this.channel = n.channel;
    this.eventname = n.eventname;
    this.cluster = n.cluster || "mt1";
    var node = this;
    var credentials = this.credentials;

    if (credentials && credentials.hasOwnProperty("pusherappkeysub")) {
      node.appkey = credentials.pusherappkeysub;
    } else {
      this.error("No Pusher app key set for input node");
      return;
    }

    // create a subscription to the channel and event defined by user
    var socket = new PusherClient("" + node.appkey, {
      cluster: node.cluster,
      forceTLS: true,
    });

    var chan = socket.subscribe("" + node.channel);
    chan.bind("" + node.eventname, function (data) {
      var msg = { topic: node.eventname, channel: node.channel };
      if (data && Object.prototype.hasOwnProperty.call(data, "payload")) {
        msg.payload = data.payload;
      } else {
        msg.payload = data;
      }
      node.send(msg);
    });

    node.on("close", function () {
      if (socket && typeof socket.disconnect === "function") {
        socket.disconnect();
      }
    });
  }

  // Node for sending Pusher events
  function PusherNodeSend(n) {
    RED.nodes.createNode(this, n);

    var node = this;
    var credentials = this.credentials;

    if (credentials && credentials.hasOwnProperty("pusherappid")) {
      this.appid = credentials.pusherappid;
    } else {
      this.error("No Pusher app id set");
      return;
    }
    if (credentials && credentials.hasOwnProperty("pusherappsecret")) {
      this.appsecret = credentials.pusherappsecret;
    } else {
      this.error("No Pusher app secret set");
      return;
    }
    if (credentials && credentials.hasOwnProperty("pusherappkey")) {
      this.appkey = credentials.pusherappkey;
    } else {
      this.error("No Pusher app key set");
      return;
    }

    // get parameters from user
    this.channel = n.channel;
    this.eventname = n.eventname;
    this.cluster = n.cluster || "mt1";

    // Default host/port for Laravel WebSockets (can be overridden via msg if needed)
    var defaultHost = "127.0.0.1";
    var defaultPort = 6001;

    var pusherd = new Pusher({
      appId: this.appid,
      key: this.appkey,
      secret: this.appsecret,
      cluster: this.cluster,
      host: defaultHost,
      port: defaultPort,
      useTLS: false,
      disableStats: true,
    });

    node.on("input", function (msg) {
      var channel = msg.channel || node.channel;
      var eventname = msg.eventname || node.eventname;

      if (!channel || !eventname) {
        node.error("Channel and event name must be set either in node config or msg");
        return;
      }

      pusherd.trigger(channel, eventname, {
        payload: msg.payload,
      });
    });

    node.on("close", function () {
      // pusher server SDK does not maintain a persistent connection for REST calls
    });
  }

  RED.nodes.registerType("pusher in", PusherNode, {
    credentials: {
      pusherappkeysub: { type: "text" },
    },
  });

  RED.nodes.registerType("pusher out", PusherNodeSend, {
    credentials: {
      pusherappid: { type: "text" },
      pusherappkey: { type: "text" },
      pusherappsecret: { type: "password" },
    },
  });
};
