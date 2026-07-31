const http = require('http');
const crypto = require('crypto');
const vscode = require('vscode');
const { McpError } = require('./sessionRegistry');

/** Local authenticated JSON-RPC gateway used by the companion stdio MCP server. */
class McpGateway {
  constructor({ registry, broker, graphService, output, extensionPath }) {
    this.registry = registry;
    this.broker = broker;
    this.graphService = graphService;
    this.output = output;
    this.extensionPath = extensionPath;
    this.token = crypto.randomBytes(32).toString('base64url');
    this.server = undefined;
    this.port = undefined;
    this.connected = false;
    this.lastError = undefined;
    this.clientConnectedListeners = new Set();
  }

  async start() {
    if (this.server) return this.connectionInfo();
    const configuredPort = getConfiguration().get('mcpServer.port', 38968);
    const server = http.createServer((request, response) => this.handle(request, response));
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(configuredPort, '127.0.0.1', resolve);
      });
      this.server = server;
      this.port = server.address().port;
      this.lastError = undefined;
    } catch (error) {
      server.close();
      this.server = undefined;
      this.port = configuredPort;
      this.lastError = error.message;
      throw error;
    }
    return this.connectionInfo();
  }

  async startIfEnabled() {
    if (!this.isEnabled()) {
      await this.stop();
      return this.getStatus();
    }
    try {
      await this.start();
    } catch {
      // The detailed failure is exposed through getStatus().
    }
    return this.getStatus();
  }

  async restart() {
    await this.stop();
    return this.startIfEnabled();
  }

  connectionInfo() {
    return { endpoint: this.getStatus().url, token: this.token };
  }

  getStatus() {
    const port = this.port || getConfiguration().get('mcpServer.port', 38968);
    return {
      enabled: this.isEnabled(),
      running: Boolean(this.server),
      connected: Boolean(this.server && this.connected),
      host: '127.0.0.1',
      port,
      path: '/rpc',
      url: `http://127.0.0.1:${port}/rpc`,
      toolNames: [
        'desmos_list_sessions', 'desmos_get_active_session', 'desmos_get_graph',
        'desmos_get_expressions', 'desmos_apply_expression_patch',
        'desmos_set_viewport', 'desmos_set_graph_settings',
        'desmos_save_as', 'desmos_export_png'
      ],
      lastError: this.lastError
    };
  }

  onClientConnected(listener) {
    this.clientConnectedListeners.add(listener);
    return { dispose: () => this.clientConnectedListeners.delete(listener) };
  }

  async showConnectionInfo() {
    const status = this.getStatus();
    const channel = this.output || vscode.window.createOutputChannel('Desmos MCP');
    const endpoint = status.url;
    const vsCodeConfig = buildVsCodeConfig(this, endpoint);
    const genericConfig = buildGenericConfig(this, endpoint);
    channel.clear();
    channel.appendLine('Desmos MCP');
    channel.appendLine('==========' );
    channel.appendLine(`Enabled: ${status.enabled}`);
    channel.appendLine(`Running: ${status.running}`);
    channel.appendLine(`Connected: ${status.connected}`);
    channel.appendLine(`Endpoint: ${endpoint}`);
    channel.appendLine(`Workspace: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'Not open'}`);
    channel.appendLine(`Last error: ${status.lastError || 'None'}`);
    channel.appendLine('');
    channel.appendLine('Exposed tools:');
    status.toolNames.forEach(name => channel.appendLine(`- ${name}`));
    channel.appendLine('');
    channel.appendLine('VS Code mcp.json:');
    channel.appendLine(vsCodeConfig);
    channel.appendLine('');
    channel.appendLine('Generic MCP client configuration:');
    channel.appendLine(genericConfig);
    channel.show(true);

    const choice = await vscode.window.showInformationMessage(
      status.running ? `Desmos MCP is ${status.connected ? 'connected' : 'running'} on port ${status.port}.` : 'Desmos MCP is not running.',
      'Copy Endpoint', 'Copy VS Code Config', 'Copy Generic Config'
    );
    if (choice === 'Copy Endpoint') await vscode.env.clipboard.writeText(endpoint);
    if (choice === 'Copy VS Code Config') await vscode.env.clipboard.writeText(vsCodeConfig);
    if (choice === 'Copy Generic Config') await vscode.env.clipboard.writeText(genericConfig);
    return status;
  }

  async handle(request, response) {
    if (request.method !== 'POST' || request.url !== '/rpc') return this.respond(response, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
    if (request.headers.authorization !== `Bearer ${this.token}`) return this.respond(response, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid gateway token' } });
    try {
      const payload = await readJson(request);
      if (!this.connected) {
        this.connected = true;
        this.clientConnectedListeners.forEach(listener => listener(this.getStatus()));
      }
      const result = await this.dispatch(payload.method, payload.params || {});
      this.respond(response, 200, { id: payload.id, result });
    } catch (error) {
      const code = error.code || 'DESMOS_GATEWAY_FAILED';
      this.respond(response, 400, { error: { code, message: error.message, details: error.details } });
    }
  }

  async dispatch(method, params) {
    switch (method) {
      case 'sessions.list': return this.registry.list();
      case 'sessions.active': return this.graphService.getSummary(params.sessionId);
      case 'graph.get': return this.graphService.getGraph(params.sessionId);
      case 'expressions.list': return this.graphService.listExpressions(params.sessionId);
      case 'expressions.patch': return this.graphService.patchExpressions(params);
      case 'viewport.set': return this.graphService.setViewport(params);
      case 'settings.set': return this.graphService.setSettings(params);
      case 'file.saveAs': return this.graphService.saveAs(params);
      case 'export.png': return this.graphService.exportPng(params);
      default: throw new McpError('DESMOS_METHOD_NOT_FOUND', `Unsupported gateway method: ${method}`);
    }
  }

  respond(response, statusCode, body) {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  }

  dispose() {
    void this.stop();
    this.clientConnectedListeners.clear();
  }

  async stop() {
    const server = this.server;
    this.server = undefined;
    this.connected = false;
    if (!server) return;
    await new Promise(resolve => server.close(() => resolve()));
  }

  isEnabled() {
    return getConfiguration().get('mcpServer.enabled', true) !== false;
  }
}

function getConfiguration() {
  return vscode.workspace.getConfiguration('desmos');
}

function buildVsCodeConfig(gateway, endpoint) {
  return JSON.stringify({
    servers: {
      desmos: {
        command: 'node',
        args: [require('path').join(gateway.extensionPath, 'mcp-server', 'index.js')],
        env: { DESMOS_MCP_ENDPOINT: endpoint, DESMOS_MCP_TOKEN: gateway.token }
      }
    }
  }, null, 2);
}

function buildGenericConfig(gateway, endpoint) {
  return JSON.stringify({
    mcpServers: {
      desmos: {
        command: 'node',
        args: [require('path').join(gateway.extensionPath, 'mcp-server', 'index.js')],
        env: { DESMOS_MCP_ENDPOINT: endpoint, DESMOS_MCP_TOKEN: gateway.token }
      }
    }
  }, null, 2);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) request.destroy(new Error('Request body too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { reject(new McpError('DESMOS_INVALID_REQUEST', 'Request body must be valid JSON')); }
    });
    request.on('error', reject);
  });
}

module.exports = { McpGateway };
