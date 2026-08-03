const path = require('path');
const vscode = require('vscode');
const { McpError } = require('./sessionRegistry');
const { GraphAnalyzer } = require('./graphAnalyzer');
const { ParameterService } = require('./parameterService');

/** Implements the graph operations exposed through the local MCP gateway. */
class GraphService {
  constructor({ registry, broker, fileService }) {
    this.registry = registry;
    this.broker = broker;
    this.fileService = fileService;
    this.analyzer = new GraphAnalyzer();
    this.parameters = new ParameterService();
  }

  getSession(sessionId) {
    return sessionId ? this.registry.get(sessionId) : this.registry.getActive();
  }

  async getSummary(sessionId) {
    const session = this.getSession(sessionId);
    const summary = await this.broker.request(session, 'session.getSummary');
    return { ...summary, sessionId: session.sessionId, revision: session.revision, dirty: session.document.isDirty };
  }

  async getGraph(sessionId) {
    const session = this.getSession(sessionId);
    const state = await this.broker.request(session, 'graph.getState');
    return { sessionId: session.sessionId, revision: session.revision, state };
  }

  async listExpressions(sessionId) {
    const session = this.getSession(sessionId);
    const expressions = await this.broker.request(session, 'expressions.list');
    return { sessionId: session.sessionId, revision: session.revision, expressions };
  }

  async patchExpressions({ sessionId, expectedRevision, operations }) {
    const session = this.getSession(sessionId);
    this.assertRevision(session, expectedRevision);
    const result = await this.broker.request(session, 'expressions.patch', { operations });
    this.updateDocument(session, result.state);
    return { sessionId: session.sessionId, revision: session.revision, ...result };
  }

  async getExpression({ sessionId, expressionId }) {
    const result = await this.listExpressions(sessionId);
    const expression = result.expressions.find(item => item.id === expressionId);
    if (!expression) throw new McpError('DESMOS_EXPRESSION_NOT_FOUND', `Expression not found: ${expressionId}`);
    return { sessionId: result.sessionId, revision: result.revision, expression };
  }

  async addExpression({ sessionId, expectedRevision, expression }) {
    return this.applySemanticPatch({ sessionId, expectedRevision, operations: [{ type: 'add', expression }] });
  }

  async updateExpression({ sessionId, expectedRevision, expressionId, patch }) {
    return this.applySemanticPatch({ sessionId, expectedRevision, operations: [{ type: 'update', id: expressionId, patch }] });
  }

  async removeExpression({ sessionId, expectedRevision, expressionId }) {
    return this.applySemanticPatch({ sessionId, expectedRevision, operations: [{ type: 'remove', id: expressionId }] });
  }

  async createFolder({ sessionId, expectedRevision, title, hidden }) {
    return this.addExpression({
      sessionId,
      expectedRevision,
      expression: { type: 'folder', hidden: hidden === true, title: title || 'Folder' }
    });
  }

  async createNote({ sessionId, expectedRevision, text }) {
    return this.addExpression({
      sessionId,
      expectedRevision,
      expression: { type: 'text', text: text || '' }
    });
  }

  async createTable({ sessionId, expectedRevision, columns = [] }) {
    return this.addExpression({
      sessionId,
      expectedRevision,
      expression: { type: 'table', columns }
    });
  }

  async reorderExpressions({ sessionId, expectedRevision, expressionIds }) {
    const result = await this.listExpressions(sessionId);
    const currentIds = result.expressions.map(item => item.id).filter(Boolean);
    const requested = [...new Set(expressionIds || [])];
    if (requested.length !== currentIds.length || requested.some(id => !currentIds.includes(id))) {
      throw new McpError('DESMOS_INVALID_OPERATION', 'expressionIds must contain every existing expression ID exactly once');
    }
    return this.applySemanticPatch({
      sessionId,
      expectedRevision,
      operations: [{ type: 'reorder', ids: requested }]
    });
  }

  async applySemanticPatch({ sessionId, expectedRevision, operations }) {
    return this.patchExpressions({ sessionId, expectedRevision, operations });
  }

  async validateGraph(sessionId) {
    const graph = await this.getGraph(sessionId);
    return { sessionId: graph.sessionId, revision: graph.revision, ...this.analyzer.analyze(graph.state) };
  }

  async analyzeExpression({ sessionId, expressionId }) {
    const result = await this.listExpressions(sessionId);
    return {
      sessionId: result.sessionId,
      revision: result.revision,
      ...this.analyzer.analyzeExpression(result.expressions, expressionId)
    };
  }

  async findDependencies(sessionId) {
    const result = await this.listExpressions(sessionId);
    return {
      sessionId: result.sessionId,
      revision: result.revision,
      dependencies: this.analyzer.dependencies(result.expressions)
    };
  }

  async listParameters(sessionId) {
    const result = await this.listExpressions(sessionId);
    return { sessionId: result.sessionId, revision: result.revision, parameters: this.parameters.list(result.expressions) };
  }

  async getParameter({ sessionId, name }) {
    const result = await this.listExpressions(sessionId);
    return { sessionId: result.sessionId, revision: result.revision, parameter: this.parameters.get(result.expressions, name) };
  }

  async setParameter({ sessionId, expectedRevision, name, value, min, max, step }) {
    const session = this.getSession(sessionId);
    this.assertRevision(session, expectedRevision);
    const result = await this.listExpressions(session.sessionId);
    const validated = this.parameters.validateUpdate(result.expressions, name, { value, min, max, step });
    const patch = { latex: `${name}=${validated.patch.value}` };
    if (validated.patch.min !== undefined || validated.patch.max !== undefined || validated.patch.step !== undefined) {
      patch.sliderBounds = { min: validated.patch.min, max: validated.patch.max, step: validated.patch.step };
    }
    const updated = await this.broker.request(session, 'expressions.patch', {
      operations: [{ type: 'update', id: validated.parameter.expressionId, patch }]
    });
    this.updateDocument(session, updated.state);
    return { sessionId: session.sessionId, revision: session.revision, parameter: this.parameters.get(updated.state.expressions?.list || [], name) };
  }

  async createSlider({ sessionId, expectedRevision, name, value = 1, min = -10, max = 10, step = 1 }) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name || '')) throw new McpError('DESMOS_INVALID_PARAMETER', 'Slider name must be a valid identifier.');
    return this.addExpression({
      sessionId,
      expectedRevision,
      expression: { latex: `${name}=${value}`, sliderBounds: { min, max, step } }
    });
  }

  async findParameterImpact({ sessionId, name }) {
    const result = await this.listExpressions(sessionId);
    return { sessionId: result.sessionId, revision: result.revision, ...this.parameters.impact(result.expressions, name) };
  }

  async setAnimationConfig({ sessionId, expectedRevision, name, playing, loopMode }) {
    const session = this.getSession(sessionId);
    this.assertRevision(session, expectedRevision);
    const result = await this.listExpressions(session.sessionId);
    const parameter = this.parameters.get(result.expressions, name);
    const updated = await this.broker.request(session, 'expressions.patch', {
      operations: [{ type: 'update', id: parameter.expressionId, patch: { playing: playing === true, loopMode } }]
    });
    this.updateDocument(session, updated.state);
    return { sessionId: session.sessionId, revision: session.revision, parameter: this.parameters.get(updated.state.expressions?.list || [], name) };
  }

  async setViewport({ sessionId, expectedRevision, viewport }) {
    const session = this.getSession(sessionId);
    this.assertRevision(session, expectedRevision);
    const result = await this.broker.request(session, 'viewport.set', { viewport });
    this.updateDocument(session, result.state);
    return { sessionId: session.sessionId, revision: session.revision, viewport: result.viewport };
  }

  async setSettings({ sessionId, expectedRevision, settings }) {
    const session = this.getSession(sessionId);
    this.assertRevision(session, expectedRevision);
    const result = await this.broker.request(session, 'settings.set', { settings });
    this.updateDocument(session, result.state);
    return { sessionId: session.sessionId, revision: session.revision, settings: result.settings };
  }

  async saveAs({ sessionId, path: targetPath }) {
    const session = this.getSession(sessionId);
    const state = await this.broker.request(session, 'graph.getState');
    const target = this.resolveWorkspacePath(targetPath);
    await this.fileService.write(target, JSON.stringify(state, null, 2));
    session.document.markSaved(JSON.stringify(state, null, 2));
    return { sessionId: session.sessionId, uri: target.toString() };
  }

  async exportPng({ sessionId, path: targetPath, targetPixelRatio = 2 }) {
    const session = this.getSession(sessionId);
    const target = this.resolveWorkspacePath(targetPath);
    const dataUrl = await this.broker.request(session, 'graph.capturePng', { targetPixelRatio }, 20_000);
    await this.fileService.writePng(target, dataUrl);
    return { sessionId: session.sessionId, uri: target.toString() };
  }

  assertRevision(session, expectedRevision) {
    if (expectedRevision === undefined || expectedRevision === null) return;
    if (expectedRevision !== session.revision) {
      throw new McpError('DESMOS_REVISION_CONFLICT', 'The graph changed after the requested revision.', { expectedRevision, actualRevision: session.revision });
    }
  }

  updateDocument(session, state) {
    const content = JSON.stringify(state, null, 2);
    if (session.document.content === content) return;
    session.document.update(content);
  }

  resolveWorkspacePath(targetPath) {
    if (!targetPath || path.isAbsolute(targetPath)) throw new McpError('DESMOS_POLICY_DENIED', 'Output path must be relative to an open workspace folder');
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) throw new McpError('DESMOS_POLICY_DENIED', 'Open a workspace folder before using file tools');
    const root = workspace.uri.fsPath;
    const candidate = path.resolve(root, targetPath);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new McpError('DESMOS_POLICY_DENIED', 'Output path escapes the workspace folder');
    return vscode.Uri.file(candidate);
  }
}

module.exports = { GraphService };
