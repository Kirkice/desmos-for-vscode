const path = require('path');
const vscode = require('vscode');
const { McpError } = require('./sessionRegistry');

/** Implements the graph operations exposed through the local MCP gateway. */
class GraphService {
  constructor({ registry, broker, fileService }) {
    this.registry = registry;
    this.broker = broker;
    this.fileService = fileService;
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
