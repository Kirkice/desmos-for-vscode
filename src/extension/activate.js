const vscode = require('vscode');
const { DesmosEditorProvider } = require('../editor/desmosEditorProvider');
const { VIEW_TYPE, COMMAND_OPEN_CALCULATOR } = require('./constants');

/** Registers VS Code integration points for the extension. */
function activateExtension(context) {
  const provider = new DesmosEditorProvider(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN_CALCULATOR, () => provider.openCalculator()),
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    }),
    provider
  );
}

module.exports = { activateExtension };
