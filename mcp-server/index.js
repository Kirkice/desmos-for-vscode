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
  tool('desmos_get_expression', 'Get one expression by ID.', {
    type: 'object', required: ['expressionId'], properties: { sessionId: { type: 'string' }, expressionId: { type: 'string' } }
  }, 'expressions.get'),
  tool('desmos_add_expression', 'Add one Desmos expression, folder, note, or table.', semanticWriteSchema({ expression: { type: 'object' } }), 'expressions.add'),
  tool('desmos_update_expression', 'Update one expression by ID.', semanticWriteSchema({ expressionId: { type: 'string' }, patch: { type: 'object' } }), 'expressions.update'),
  tool('desmos_remove_expression', 'Remove one expression by ID.', semanticWriteSchema({ expressionId: { type: 'string' } }), 'expressions.remove'),
  tool('desmos_reorder_expressions', 'Reorder every expression in the graph.', semanticWriteSchema({ expressionIds: { type: 'array', minItems: 1, items: { type: 'string' } } }), 'expressions.reorder'),
  tool('desmos_create_folder', 'Create an expression folder.', semanticWriteSchema({ title: { type: 'string' }, hidden: { type: 'boolean' } }), 'expressions.createFolder'),
  tool('desmos_create_note', 'Create a text note in the graph.', semanticWriteSchema({ text: { type: 'string' } }), 'expressions.createNote'),
  tool('desmos_create_table', 'Create a Desmos table with optional columns.', semanticWriteSchema({ columns: { type: 'array' } }), 'expressions.createTable'),
  tool('desmos_validate_graph', 'Validate graph structure, references, visibility, and viewport.', sessionSchema(), 'graph.validate'),
  tool('desmos_analyze_expression', 'Analyze one expression and its referenced variables.', {
    type: 'object', required: ['expressionId'], properties: { sessionId: { type: 'string' }, expressionId: { type: 'string' } }
  }, 'graph.analyzeExpression'),
  tool('desmos_find_expression_dependencies', 'Build expression-to-expression variable dependencies.', sessionSchema(), 'graph.findDependencies'),
  tool('desmos_list_parameters', 'List numeric parameter and slider expressions.', sessionSchema(), 'parameters.list'),
  tool('desmos_get_parameter', 'Get one parameter by name.', {
    type: 'object', required: ['name'], properties: { sessionId: { type: 'string' }, name: { type: 'string' } }
  }, 'parameters.get'),
  tool('desmos_set_parameter', 'Set a parameter value and optional slider bounds.', semanticWriteSchema({ name: { type: 'string' }, value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' } }), 'parameters.set'),
  tool('desmos_create_slider', 'Create a numeric parameter with slider bounds.', semanticWriteSchema({ name: { type: 'string' }, value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' } }), 'parameters.createSlider'),
  tool('desmos_find_parameter_impact', 'Find expressions that reference a parameter.', {
    type: 'object', required: ['name'], properties: { sessionId: { type: 'string' }, name: { type: 'string' } }
  }, 'parameters.impact'),
  tool('desmos_set_animation_config', 'Configure parameter animation state and loop mode.', semanticWriteSchema({ name: { type: 'string' }, playing: { type: 'boolean' }, loopMode: { type: 'string' } }), 'animation.setConfig'),
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

function semanticWriteSchema(properties) {
  return {
    type: 'object',
    required: Object.keys(properties),
    properties: {
      sessionId: { type: 'string' },
      expectedRevision: { type: 'integer', minimum: 0 },
      ...properties
    }
  };
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
