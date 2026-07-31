/* global Desmos */

(function bootstrap() {
  'use strict';

  // Webview 只负责界面交互和计算器状态，不直接访问文件系统。
  const vscode = acquireVsCodeApi();
  const status = document.getElementById('status');
  const container = document.getElementById('calculator');
  let calculator;
  let statusTimer;

  function notify(text) {
    status.textContent = text || '';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ''; }, 2500);
  }

  function getStateText() {
    return JSON.stringify(calculator.getState(), null, 2);
  }

  function loadState(content) {
    try {
      calculator.setState(JSON.parse(content));
      notify('已加载');
    } catch (error) {
      calculator.setBlank();
      notify('文件格式无效，已创建空白图形');
    }
  }

  function postSave() {
    vscode.postMessage({ type: 'save', content: getStateText() });
  }

  function handleAction(action) {
    switch (action) {
      case 'new':
        calculator.setBlank();
        vscode.postMessage({ type: 'documentChanged', content: getStateText() });
        break;
      case 'open':
        vscode.postMessage({ type: 'open' });
        break;
      case 'save':
        postSave();
        break;
      case 'saveAs':
        vscode.postMessage({ type: 'saveAs', content: getStateText() });
        break;
      case 'export':
        vscode.postMessage({
          type: 'export',
          dataUrl: calculator.screenshot({ targetPixelRatio: 2 })
        });
        break;
      case 'openInEditor':
        vscode.postMessage({ type: 'openInEditor' });
        break;
      default:
        notify('未知操作');
    }
  }

  function initialize() {
    calculator = Desmos.GraphingCalculator(container);
    const initialState = window.__DESMOS_INITIAL_STATE__;
    if (initialState) loadState(initialState);
    else calculator.setExpression({ id: 'graph1', latex: 'y=x^2' });

    // Desmos 状态变化时同步给宿主，支持 VS Code 的 dirty 状态和保存生命周期。
    calculator.observeEvent('change', () => {
      vscode.postMessage({ type: 'documentChanged', content: getStateText() });
    });

    document.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => handleAction(button.dataset.action));
    });
  }

  window.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'load') loadState(message.content);
    if (message.type === 'notify') notify(message.text);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
