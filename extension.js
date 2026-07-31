const { activateExtension } = require('./src/extension/activate');

/** Minimal VS Code entry point. */
function activate(context) {
  activateExtension(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
