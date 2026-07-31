const crypto = require('crypto');
const { McpError } = require('./sessionRegistry');

/** Correlates request/response messages between the Extension Host and a calculator Webview. */
class CalculatorRpcBroker {
  constructor(timeoutMs = 10_000) {
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
  }

  request(session, method, params = {}, timeoutMs = this.timeoutMs) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new McpError('DESMOS_RPC_TIMEOUT', `Calculator did not respond to ${method}`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      session.panel.webview.postMessage({ type: 'calculatorRpcRequest', requestId, method, params });
    });
  }

  resolve(message) {
    const pending = this.pending.get(message.requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new McpError(message.error?.code || 'DESMOS_RPC_FAILED', message.error?.message || 'Calculator request failed'));
    return true;
  }

  dispose() {
    for (const { timer, reject } of this.pending.values()) {
      clearTimeout(timer);
      reject(new McpError('DESMOS_RPC_CANCELLED', 'Calculator session was closed'));
    }
    this.pending.clear();
  }
}

module.exports = { CalculatorRpcBroker };
