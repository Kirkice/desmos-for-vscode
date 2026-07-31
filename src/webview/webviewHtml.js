const vscode = require('vscode');

/** Generates a random nonce for the Webview Content Security Policy. */
function createNonce() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Builds the calculator Webview document.
 * Markup, CSS, and UI behavior are separate resources; the host only injects initial state.
 */
function createWebviewHtml(webview, extensionUri, initialState, options = {}) {
  const nonce = createNonce();
  const calculatorUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'vendor', 'desmos', 'calculator.js')
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'app.js')
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'styles.css')
  );
  const safeState = JSON.stringify(initialState || '').replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Desmos injects styles dynamically and evaluates expressions in a Blob Worker. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; worker-src blob:; child-src blob:; font-src data:; img-src ${webview.cspSource} data: blob:;">
  <link rel="stylesheet" href="${cssUri}">
  <title>Desmos Calculator</title>
</head>
<body>
  <header id="toolbar" aria-label="Desmos file toolbar"${options.compact ? ' data-compact="true"' : ''}>
    <div class="toolbar-brand" aria-hidden="true">
      <svg class="toolbar-brand-mark" viewBox="0 0 24 24" focusable="false">
        <path d="M3.2 2.3C4.6 8.3 6.7 12.3 10.4 16.6M20.8 2.3C19.4 8.3 17.3 12.3 13.6 16.6M1.6 14.1c2.1 2.1 3.1 3.2 5 3.2 2.1 0 2.7-3.1 5.4-3.1s3.3 3.1 5.4 3.1c1.9 0 2.9-1.1 5-3.2M8.5 16.5c1.1-1 2.1-1.7 3.5-1.7s2.4.7 3.5 1.7"/>
      </svg>
      <span>Desmos</span>
    </div>
    <div class="toolbar-actions" role="group" aria-label="File actions">
      <button class="toolbar-button" data-action="new" title="New graph">
        <span class="button-icon" aria-hidden="true">＋</span><span>New</span>
      </button>
      <button class="toolbar-button" data-action="open" title="Open a .des file">
        <span class="button-icon" aria-hidden="true">↗</span><span>Open</span>
      </button>
      <span class="toolbar-divider" aria-hidden="true"></span>
      <button class="toolbar-button toolbar-button-primary" data-action="save" title="Save graph">
        <span class="button-icon" aria-hidden="true">⌘</span><span>Save</span>
      </button>
      <button class="toolbar-button" data-action="saveAs" title="Save as a .des file">
        <span class="button-icon" aria-hidden="true">⧉</span><span>Save As</span>
      </button>
      <button class="toolbar-button" data-action="export" title="Export PNG image">
        <span class="button-icon" aria-hidden="true">⇩</span><span>Export</span>
      </button>${options.compact ? '<button class="toolbar-button" data-action="openInEditor" title="Open in editor"><span class="button-icon" aria-hidden="true">↗</span><span>Open in Editor</span></button>' : ''}
    </div>
    <span id="status" role="status" aria-live="polite"></span>
  </header>
  <main id="calculator" aria-label="Desmos Calculator"></main>
  <script nonce="${nonce}">
    window.__DESMOS_INITIAL_STATE__ = ${safeState};
  </script>
  <script nonce="${nonce}" src="${calculatorUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

module.exports = { createWebviewHtml };
