const vscode = require('vscode');
const { DesmosEditorProvider } = require('./src/host/desmosEditorProvider');

const VIEW_TYPE = 'desmos.graph';
const COMMAND_OPEN_CALCULATOR = 'vscode-desmos.openCalculator';

/**
 * 扩展入口：只负责注册 VS Code 能力，业务逻辑由独立模块实现。
 */
function activate(context) {
  const provider = new DesmosEditorProvider(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN_CALCULATOR, () => {
      return provider.openCalculator();
    }),
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    }),
    provider
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
