const TimeMachina = require("./src/time_machina");
const https = require("https");

module.exports = function (RED) {
    function offlineAlertNode(n) {
        RED.nodes.createNode(this, n);
        this.slotId = n.slot;
        var self = this;
        this.pingMachine = new TimeMachina({
            node: self,
            slotId: self.slotId,
            pingUrl: "https://d5d6qu0cfbfq01gqpuej.apigw.yandexcloud.net/qping/",
            retryCounter: 0,
            namespace: "OfflineAlert",
            _doPing: function () {
                const options = {
                    timeout: 10000
                }
                const req = https.get(this.pingUrl + this.slotId, this.handle.bind(this, 'http_success'));
                req.on('error', this.handle.bind(this, 'http_error'));
                req.on('timeout', function () {
                    req.destroy();
                });
                req.end();
                this.transition('PINGING');
            },
            initialize: function () {
                if (this.node._flow.getSetting("OAB_URL")) {
                    this.pingUrl = this.node._flow.getSetting("OAB_URL");
                    this.debug("Override url", this.pingUrl);
                }
                if (!this.node._flow.getSetting("OAB_DEBUG")) {
                    this.debug = function () { }
                }
            },
            states: {
                uninitialized: {
                    _onEnter: function () {
                        this._doPing();
                    },
                },
                PINGING: {
                    _onEnter: function () {
                        this.node.status({ fill: "yellow", shape: "ring", text: "pinging" });
                    },
                    http_success: function (res) {
                        if (res.statusCode == 200) {
                            this.node.status({ fill: "green", shape: "dot", text: "ok" });
                            this.retryCounter = 0;
                            this._scheduleEvent('ping', 60 * 1000);
                            this.transition('PAUSE');
                            return;
                        }
                        this.debug(res.statusCode, res.headers);
                        if (res.statusCode > 500) {
                            this.node.status({ fill: "red", shape: "ring", text: res.statusCode });
                            this._scheduleEvent('ping', 20 * 1000);
                            this.transition('PAUSE');
                            return;
                        }
                        this.node.status({ fill: "red", shape: "ring", text: res.statusCode });
                        this._scheduleEvent('ping', 60 * 60 * 1000);
                        this.transition('PAUSE');
                        return;
                    },
                    http_error: function (err) {
                        this.warn(err.message);
                        this.node.status({ fill: "red", shape: "ring", text: err.message });
                        this.retryCounter += 1;
                        let delay = 120;
                        if (this.retryCounter < 5) {
                            delay = 20 * this.retryCounter;
                        }
                        this._scheduleEvent('ping', delay * 1000);
                        this.transition('PAUSE');
                    },
                    node_close: 'CLOSED'
                },
                PAUSE: {
                    // _onEnter: function () {
                    //     this.node.status({ fill: "green", shape: "dot", text: "ok" });
                    //     this._scheduleEvent('ping', 60 * 1000);
                    // },
                    ping: function () {
                        this._doPing();
                    },
                    node_close: function () {
                        this._cancelEvent('ping');
                        this.transition('CLOSED');
                    }
                },
                CLOSED: {

                }
            }
        });
        this.on("close", function () {
            this.pingMachine.handle('node_close');
            this.pingMachine = null;
        });
    }

    RED.nodes.registerType("offline-alert", offlineAlertNode);
}