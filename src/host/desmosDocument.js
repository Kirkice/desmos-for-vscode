const vscode = require('vscode');

/**
 * Desmos 文档模型：只管理内存内容、dirty 状态和 VS Code 文档事件。
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

  /** 更新内存内容，并通知 Custom Editor Provider。 */
  update(content) {
    if (content === this._content) return;
    this._content = content;
    this._isDirty = true;
    this._onDidChange.fire({ document: this, content });
  }

  /** 保存成功后清除 dirty 标记。 */
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
