const { activateExtension } = require('./src/extension/activate');

/** Minimal VS Code entry point. */
function activate(context) {
  return activateExtension(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
