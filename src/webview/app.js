/* global Desmos */

(function bootstrap() {
  'use strict';

  // The Webview owns UI interaction and calculator state, never direct file-system access.
  const vscode = acquireVsCodeApi();
  const status = document.getElementById('status');
  const container = document.getElementById('calculator');
  let calculator;
  let statusTimer;
  let isApplyingRpc = false;
  let mcpStatus = window.__DESMOS_MCP_STATUS__;

  function toggleMcpPanel() {
    const panel = document.getElementById('mcp-panel');
    const button = document.querySelector('[data-action="toggleMcp"]');
    const hidden = panel.classList.toggle('mcp-panel-hidden');
    panel.setAttribute('aria-hidden', String(hidden));
    button.classList.toggle('toolbar-button-active', !hidden);
    button.title = hidden ? 'Show MCP status' : 'Hide MCP status';
  }

  function renderMcpStatus(next) {
    mcpStatus = next || mcpStatus;
    const enabled = !!mcpStatus.enabled;
    const running = !!mcpStatus.running;
    const connected = !!mcpStatus.connected;
    const title = document.getElementById('mcp-title');
    const summary = document.getElementById('mcp-summary');
    const chip = document.getElementById('mcp-chip');
    const dot = document.getElementById('mcp-dot');
    const detail = document.getElementById('mcp-detail');
    const toggle = document.getElementById('mcp-toggle');
    dot.className = `mcp-dot ${!enabled || !running ? 'red' : connected ? 'green' : 'blue'}`;
    chip.className = `mcp-chip ${!enabled || !running ? 'error' : connected ? 'connected' : 'good'}`;
    chip.textContent = !enabled ? 'Off' : !running ? 'Error' : connected ? `Connected · Port ${mcpStatus.port}` : `Running · Port ${mcpStatus.port}`;
    title.textContent = !enabled ? 'Local MCP Disabled' : !running ? 'Local MCP Needs Attention' : connected ? 'Local MCP Connected' : 'Local MCP Ready';
    summary.textContent = !enabled ? 'Enable MCP to let local AI clients connect to this VS Code window.' : connected ? 'An MCP client is connected and can inspect or edit the active graph.' : running ? 'External MCP clients can connect through this local endpoint.' : 'MCP is enabled, but the local server is not reachable.';
    detail.textContent = running ? `Endpoint: ${mcpStatus.url}` : (mcpStatus.lastError || 'No active endpoint');
    toggle.textContent = enabled ? 'Turn Off MCP' : 'Turn On MCP';
  }

  function notify(text) {
    status.textContent = text || '';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ''; }, 2500);
  }

  function getStateText() {
    return JSON.stringify(calculator.getState(), null, 2);
  }

  function getState() {
    return calculator.getState();
  }

  function createRpcError(error) {
    return {
      code: 'DESMOS_RPC_FAILED',
      message: error instanceof Error ? error.message : String(error)
    };
  }

  function patchExpressions(operations) {
    for (const operation of operations || []) {
      if (operation.type === 'add') calculator.setExpression(operation.expression);
      else if (operation.type === 'update') calculator.setExpression({ id: operation.id, ...operation.patch });
      else if (operation.type === 'remove') calculator.removeExpression({ id: operation.id });
      else if (operation.type === 'reorder') reorderExpressions(operation.ids);
      else throw new Error(`Unsupported expression operation: ${operation.type}`);
    }
    return { state: getState(), applied: (operations || []).length };
  }

  function reorderExpressions(ids) {
    const state = getState();
    const list = state.expressions?.list || [];
    const byId = new Map(list.map(expression => [expression.id, expression]));
    if (!Array.isArray(ids) || ids.length !== list.length || ids.some(id => !byId.has(id))) {
      throw new Error('Reorder operation must include every expression exactly once.');
    }
    const reordered = ids.map(id => byId.get(id));
    calculator.setState({ ...state, expressions: { ...state.expressions, list: reordered } });
  }

  function handleRpc(method, params) {
    switch (method) {
      case 'session.getSummary': {
        const state = getState();
        return {
          expressionCount: state.expressions?.list?.length || 0,
          viewport: state.graph?.viewport,
          settings: state.graph || {}
        };
      }
      case 'graph.getState':
        return getState();
      case 'expressions.list':
        return getState().expressions?.list || [];
      case 'expressions.patch':
        return patchExpressions(params.operations);
      case 'viewport.set':
        calculator.setMathBounds(params.viewport);
        return { viewport: getState().graph?.viewport, state: getState() };
      case 'settings.set':
        calculator.updateSettings(params.settings || {});
        return { settings: params.settings || {}, state: getState() };
      case 'graph.capturePng':
        return calculator.screenshot({ targetPixelRatio: params.targetPixelRatio || 2 });
      default:
        throw new Error(`Unsupported calculator RPC method: ${method}`);
    }
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
      case 'toggleMcp':
        toggleMcpPanel();
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
      if (!isApplyingRpc) {
        vscode.postMessage({ type: 'documentChanged', content: getStateText() });
      }
    });

    document.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => handleAction(button.dataset.action));
    });
    document.getElementById('mcp-toggle').addEventListener('click', () => vscode.postMessage({ type: 'mcp:setEnabled', enabled: !mcpStatus.enabled }));
    document.getElementById('mcp-info').addEventListener('click', () => vscode.postMessage({ type: 'mcp:info' }));
    renderMcpStatus(mcpStatus);
  }

  window.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'load') loadState(message.content);
    if (message.type === 'notify') notify(message.text);
    if (message.type === 'mcpStatus') renderMcpStatus(message.status);
    if (message.type === 'calculatorRpcRequest') {
      try {
        isApplyingRpc = true;
        const result = handleRpc(message.method, message.params || {});
        vscode.postMessage({ type: 'calculatorRpcResponse', requestId: message.requestId, ok: true, result });
      } catch (error) {
        vscode.postMessage({ type: 'calculatorRpcResponse', requestId: message.requestId, ok: false, error: createRpcError(error) });
      } finally {
        isApplyingRpc = false;
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
