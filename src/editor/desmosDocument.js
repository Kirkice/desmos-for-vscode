const vscode = require('vscode');

/**
 * Desmos document model: manages in-memory content, dirty state, and VS Code document events.
 */
class DesmosDocument {
  constructor(uri, content) {
    this.uri = uri;
    this._content = content || '';
    this._isDirty = false;
    this._disposed = false;
    this._onDidDispose = new vscode.EventEmitter();
    this._onDidChange = new vscode.EventEmitter();
  }

  get isDirty() { return this._isDirty; }
  get content() { return this._content; }
  get onDidDispose() { return this._onDidDispose.event; }
  get onDidChange() { return this._onDidChange.event; }

  /** Updates in-memory content and notifies the Custom Editor Provider. */
  update(content) {
    if (content === this._content) return;
    this._content = content;
    this._isDirty = true;
    this._onDidChange.fire({ document: this, content });
  }

  /** Clears the dirty flag after a successful save. */
  markSaved(content) {
    this._content = content;
    this._isDirty = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
    this._onDidChange.dispose();
  }
}

module.exports = { DesmosDocument };
