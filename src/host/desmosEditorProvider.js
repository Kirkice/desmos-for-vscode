const vscode = require('vscode');
const { DesmosDocument } = require('./desmosDocument');
const { FileService } = require('./fileService');
const { MessageRouter } = require('./messageRouter');
const { createWebviewHtml } = require('./webviewHtml');

/** VS Code Custom Editor Provider：只编排编辑器生命周期。 */
class DesmosEditorProvider {
  constructor(context) {
    this.context = context;
    this.fileService = new FileService();
    this.documents = new Map();
    this._onDidChangeCustomDocument = new vscode.EventEmitter();
  }

  get onDidChangeCustomDocument() {
    return this._onDidChangeCustomDocument.event;
  }

  /** 打开不关联文件的独立计算器窗口。 */
  openCalculator() {
    const panel = vscode.window.createWebviewPanel(
      'desmos.calculator',
      'Desmos 计算器',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
      }
    );
    const document = new DesmosDocument(
      vscode.Uri.parse(`untitled:Desmos-${Date.now()}.des`),
      ''
    );
    this.configurePanel(panel, document);
    panel.onDidDispose(() => document.dispose());
    return panel;
  }

  async openCustomDocument(uri) {
    const content = await this.fileService.read(uri);
    const document = new DesmosDocument(uri, content);
    this.documents.set(uri.toString(), document);
    document.onDidChange(event => this._onDidChangeCustomDocument.fire(event));
    document.onDidDispose(() => this.documents.delete(uri.toString()));
    return document;
  }

  async resolveCustomEditor(document, webviewPanel) {
    this.configurePanel(webviewPanel, document);
  }

  /** 统一配置自定义编辑器和独立计算器的 Webview。 */
  configurePanel(webviewPanel, document) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    webviewPanel.webview.html = createWebviewHtml(
      webviewPanel.webview,
      this.context.extensionUri,
      document.content
    );

    const router = new MessageRouter({
      panel: webviewPanel,
      document,
      fileService: this.fileService
    });
    webviewPanel.onDidDispose(() => router.dispose());
  }

  async saveCustomDocument(document) {
    await this.fileService.write(document.uri, document.content);
    document.markSaved(document.content);
  }

  async saveCustomDocumentAs(document, destination) {
    await this.fileService.write(destination, document.content);
    document.markSaved(document.content);
  }

  async revertCustomDocument(document) {
    document.markSaved(await this.fileService.read(document.uri));
  }

  backupCustomDocument(document, context) {
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination, { useTrash: false })
    };
  }

  dispose() {
    this._onDidChangeCustomDocument.dispose();
    for (const document of this.documents.values()) document.dispose();
    this.documents.clear();
  }
}

module.exports = { DesmosEditorProvider };
