/* global Desmos */

(function bootstrap() {
  'use strict';

  // The Webview owns UI interaction and calculator state, never direct file-system access.
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
      notify('Loaded');
    } catch (error) {
      calculator.setBlank();
      notify('Invalid file format. Created a blank graph.');
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
        notify('Unknown action');
    }
  }

  function initialize() {
    // The Desmos API has no complete dark-theme switch. invertedColors adapts the
    // canvas, axes, and curves while Webview CSS controls the surrounding UI.
    calculator = Desmos.GraphingCalculator(container, {
      invertedColors: true,
      projectorMode: false,
      autosize: true
    });
    const initialState = window.__DESMOS_INITIAL_STATE__;
    if (initialState) loadState(initialState);
    else calculator.setExpression({ id: 'graph1', latex: 'y=x^2' });

    // Sync Desmos changes to the host to support VS Code dirty state and save lifecycle.
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
