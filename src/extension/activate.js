const vscode = require('vscode');
const path = require('path');
const { DesmosEditorProvider } = require('../editor/desmosEditorProvider');
const { VIEW_TYPE, COMMAND_OPEN_CALCULATOR } = require('./constants');
const { SessionRegistry } = require('../mcp/sessionRegistry');
const { CalculatorRpcBroker } = require('../mcp/calculatorRpcBroker');
const { GraphService } = require('../mcp/graphService');
const { McpGateway } = require('../mcp/mcpGateway');

/** Registers VS Code integration points for the extension. */
async function activateExtension(context) {
  const registry = new SessionRegistry();
  const rpcBroker = new CalculatorRpcBroker();
  const provider = new DesmosEditorProvider(context, { sessionRegistry: registry, rpcBroker });
  const graphService = new GraphService({ registry, broker: rpcBroker, fileService: provider.fileService });
  const output = vscode.window.createOutputChannel('Desmos MCP');
  const gateway = new McpGateway({
    registry,
    broker: rpcBroker,
    graphService,
    output,
    extensionPath: context.extensionPath
  });
  provider.setMcpController({
    getStatus: () => gateway.getStatus(),
    setEnabled: async enabled => {
      await vscode.workspace.getConfiguration('desmos').update(
        'mcpServer.enabled', enabled, vscode.ConfigurationTarget.Global
      );
      const status = await gateway.restart();
      updateMcpUi(status);
      provider.updateMcpStatus(status);
    },
    showInfo: () => gateway.showConnectionInfo()
  });
  const mcpStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);
  mcpStatusBarItem.command = 'vscode-desmos.showMcpServerInfo';

  const updateMcpUi = status => {
    const next = status || gateway.getStatus();
    mcpStatusBarItem.backgroundColor = undefined;
    if (!next.enabled) {
      mcpStatusBarItem.text = '$(circle-slash) MCP: Off';
      mcpStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      mcpStatusBarItem.tooltip = 'Desmos MCP is disabled. Click to inspect MCP status.';
    } else if (next.running && next.connected) {
      mcpStatusBarItem.text = `$(pass-filled) MCP: ${next.port}`;
      mcpStatusBarItem.color = new vscode.ThemeColor('testing.iconPassed');
      mcpStatusBarItem.tooltip = `Desmos MCP is connected.\nEndpoint: ${next.url}`;
    } else if (next.running) {
      mcpStatusBarItem.text = `$(hubot) MCP: ${next.port}`;
      mcpStatusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
      mcpStatusBarItem.tooltip = `Desmos MCP is running and waiting for a client.\nEndpoint: ${next.url}`;
    } else {
      mcpStatusBarItem.text = `$(warning) MCP: ${next.port}`;
      mcpStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      mcpStatusBarItem.tooltip = ['Desmos MCP is enabled but not running.', next.lastError].filter(Boolean).join('\n');
    }
    mcpStatusBarItem.show();
    provider.updateMcpStatus(next);
  };

  const setMcpServerEnabled = async enabled => {
    await vscode.workspace.getConfiguration('desmos').update(
      'mcpServer.enabled', enabled, vscode.ConfigurationTarget.Global
    );
    const status = await gateway.restart();
    updateMcpUi(status);
  };

  const clientConnectionDisposable = gateway.onClientConnected(() => updateMcpUi());
  const initialStatus = await gateway.startIfEnabled();
  updateMcpUi(initialStatus);

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN_CALCULATOR, () => provider.openCalculator()),
    vscode.commands.registerCommand('vscode-desmos.copyMcpConfiguration', async () => {
      const status = await gateway.startIfEnabled();
      if (!status.running) {
        vscode.window.showWarningMessage(`Desmos MCP is not running: ${status.lastError || 'it is disabled'}`);
        return;
      }
      const connection = gateway.connectionInfo();
      const config = JSON.stringify({
        mcpServers: {
          desmos: {
            command: 'node',
            args: [path.join(context.extensionPath, 'mcp-server', 'index.js')],
            env: { DESMOS_MCP_ENDPOINT: connection.endpoint, DESMOS_MCP_TOKEN: connection.token }
          }
        }
      }, null, 2);
      await vscode.env.clipboard.writeText(config);
      output.appendLine(`Desmos MCP gateway started: ${connection.endpoint}`);
      vscode.window.showInformationMessage('Desmos MCP configuration copied to the clipboard.');
    }),
    vscode.commands.registerCommand('vscode-desmos.showMcpServerInfo', () => gateway.showConnectionInfo()),
    vscode.commands.registerCommand('vscode-desmos.toggleMcpServer', () => setMcpServerEnabled(!gateway.getStatus().enabled)),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('desmos.mcpServer.enabled') || event.affectsConfiguration('desmos.mcpServer.port')) {
        void gateway.restart().then(updateMcpUi);
      }
    }),
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    }),
    provider,
    output,
    mcpStatusBarItem,
    clientConnectionDisposable,
    { dispose: () => { gateway.dispose(); rpcBroker.dispose(); } }
  );
}

module.exports = { activateExtension };
