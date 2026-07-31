#!/usr/bin/env node

/**
 * Dependency-free MCP stdio server.
 * It implements the small MCP surface required by this extension and proxies calls
 * to the authenticated, loopback-only gateway opened by VS Code.
 */
const readline = require('readline');

const endpoint = process.env.DESMOS_MCP_ENDPOINT;
const token = process.env.DESMOS_MCP_TOKEN;

const tools = [
  tool('desmos_list_sessions', 'List currently open Desmos calculator and .des editor sessions.', { type: 'object', properties: {} }, 'sessions.list'),
  tool('desmos_get_active_session', 'Get a summary of the active Desmos session.', { type: 'object', properties: {} }, 'sessions.active'),
  tool('desmos_get_graph', 'Get the complete Desmos graph state for a session.', sessionSchema(), 'graph.get'),
  tool('desmos_get_expressions', 'List normalized expressions, folders, notes, and tables for a session.', sessionSchema(), 'expressions.list'),
  tool('desmos_apply_expression_patch', 'Atomically add, update, or remove Desmos expressions. Supply expectedRevision to prevent overwriting user changes.', {
    type: 'object',
    required: ['operations'],
    properties: {
      sessionId: { type: 'string', description: 'Optional session ID. Defaults to the active session.' },
      expectedRevision: { type: 'integer', minimum: 0 },
      operations: { type: 'array', minItems: 1, items: { type: 'object' } }
    }
  }, 'expressions.patch'),
  tool('desmos_set_viewport', 'Set graph math bounds. Supply expectedRevision to prevent overwriting user changes.', {
    type: 'object',
    required: ['viewport'],
    properties: {
      sessionId: { type: 'string' },
      expectedRevision: { type: 'integer', minimum: 0 },
      viewport: {
        type: 'object', required: ['left', 'right', 'bottom', 'top'],
        properties: { left: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' }, top: { type: 'number' } }
      }
    }
  }, 'viewport.set'),
  tool('desmos_set_graph_settings', 'Update supported Desmos graph settings. Supply expectedRevision to prevent overwriting user changes.', {
    type: 'object',
    required: ['settings'],
    properties: { sessionId: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 0 }, settings: { type: 'object' } }
  }, 'settings.set'),
  tool('desmos_save_as', 'Save the current graph as a .des file under the open VS Code workspace.', {
    type: 'object', required: ['path'], properties: { sessionId: { type: 'string' }, path: { type: 'string', description: 'Workspace-relative output path, for example graphs/sine.des' } }
  }, 'file.saveAs'),
  tool('desmos_export_png', 'Export the current graph as a PNG under the open VS Code workspace.', {
    type: 'object', required: ['path'], properties: { sessionId: { type: 'string' }, path: { type: 'string', description: 'Workspace-relative output path, for example artifacts/graph.png' }, targetPixelRatio: { type: 'number', minimum: 1, maximum: 4 } }
  }, 'export.png')
];

function tool(name, description, inputSchema, gatewayMethod) {
  return { name, description, inputSchema, gatewayMethod };
}

function sessionSchema() {
  return { type: 'object', properties: { sessionId: { type: 'string', description: 'Optional session ID. Defaults to the active session.' } } };
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function gatewayCall(method, params) {
  if (!endpoint || !token) throw new Error('DESMOS_MCP_ENDPOINT and DESMOS_MCP_TOKEN must be configured by VS Code.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id: crypto.randomUUID(), method, params })
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    const error = new Error(body.error?.message || `Gateway request failed with HTTP ${response.status}`);
    error.code = body.error?.code;
    error.details = body.error?.details;
    throw error;
  }
  return body.result;
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0') return;
  if (message.method === 'notifications/initialized') return;
  if (message.method === 'initialize') {
    return {
      protocolVersion: message.params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'desmos-vscode', version: '1.0.0' }
    };
  }
  if (message.method === 'tools/list') {
    return { tools: tools.map(({ gatewayMethod, ...definition }) => definition) };
  }
  if (message.method === 'tools/call') {
    const selected = tools.find(candidate => candidate.name === message.params?.name);
    if (!selected) throw new Error(`Unknown tool: ${message.params?.name}`);
    const result = await gatewayCall(selected.gatewayMethod, message.params?.arguments || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      // MCP clients expect structuredContent to be an object, including for list results.
      structuredContent: normalizeStructuredContent(result)
    };
  }
  const error = new Error(`Method not found: ${message.method}`);
  error.rpcCode = -32601;
  throw error;
}

function normalizeStructuredContent(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { value };
}

const crypto = require('crypto');
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', async line => {
  let request;
  try {
    request = JSON.parse(line);
    const result = await handle(request);
    if (request.id !== undefined) send({ jsonrpc: '2.0', id: request.id, result });
  } catch (error) {
    if (request?.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: error.rpcCode || -32000,
          message: error.message,
          data: error.code ? { code: error.code, details: error.details } : undefined
        }
      });
    }
  }
});
