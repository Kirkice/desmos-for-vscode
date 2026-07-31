const vscode = require('vscode');

/** 生成随机 nonce，用于 Webview 内容安全策略。 */
function createNonce() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * 构建计算器 Webview 页面。
 * 页面结构、CSS 和交互逻辑分别由独立资源承担，宿主只负责注入初始状态。
 */
function createWebviewHtml(webview, extensionUri, initialState, options = {}) {
  const nonce = createNonce();
  const calculatorUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'calculator.js')
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'app.js')
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'webview.css')
  );
  const safeState = JSON.stringify(initialState || '').replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Desmos 会动态注入样式，并通过 Blob Worker 执行表达式计算。 -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; worker-src blob:; child-src blob:; font-src data:; img-src ${webview.cspSource} data: blob:;">
  <link rel="stylesheet" href="${cssUri}">
  <title>Desmos 计算器</title>
</head>
<body>
  <header id="toolbar" aria-label="文件工具栏"${options.compact ? ' data-compact="true"' : ''}>
    <button data-action="new">新建</button>
    <button data-action="open">打开</button>
    <button data-action="save">保存</button>
    <button data-action="saveAs">另存为</button>
    <button data-action="export">导出 PNG</button>${options.compact ? '<button data-action="openInEditor">在编辑器中打开</button>' : ''}
    <span id="status" role="status" aria-live="polite"></span>
  </header>
  <main id="calculator" aria-label="Desmos 计算器"></main>
  <script nonce="${nonce}">
    window.__DESMOS_INITIAL_STATE__ = ${safeState};
  </script>
  <script nonce="${nonce}" src="${calculatorUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

module.exports = { createWebviewHtml };
