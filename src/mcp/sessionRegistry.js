const crypto = require('crypto');

/** Tracks live calculator panels that MCP clients are allowed to address. */
class SessionRegistry {
  constructor() {
    this.sessions = new Map();
    this.activeSessionId = undefined;
  }

  register({ panel, document, kind }) {
    const sessionId = crypto.randomUUID();
    const session = {
      sessionId,
      panel,
      document,
      kind,
      revision: 0,
      createdAt: new Date().toISOString()
    };
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;
    return session;
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new McpError('DESMOS_SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
    return session;
  }

  list() {
    return [...this.sessions.values()].map(session => ({
      sessionId: session.sessionId,
      title: session.panel.title,
      uri: session.document.uri.toString(),
      kind: session.kind,
      revision: session.revision,
      dirty: session.document.isDirty,
      createdAt: session.createdAt
    }));
  }

  getActive() {
    if (!this.activeSessionId) throw new McpError('DESMOS_SESSION_NOT_FOUND', 'No active Desmos session');
    return this.get(this.activeSessionId);
  }

  touch(sessionId) {
    const session = this.get(sessionId);
    this.activeSessionId = sessionId;
    return session;
  }

  incrementRevision(sessionId) {
    const session = this.get(sessionId);
    session.revision += 1;
    return session.revision;
  }

  unregister(sessionId) {
    this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = this.sessions.keys().next().value;
    }
  }
}

class McpError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

module.exports = { SessionRegistry, McpError };
