const vscode = require('vscode');
const { DesmosDocument } = require('./desmosDocument');
const { FileService } = require('../platform/fileService');
const { MessageRouter } = require('../bridge/messageRouter');
const { createWebviewHtml } = require('../webview/webviewHtml');

/** VS Code Custom Editor Provider: orchestrates editor lifecycle only. */
class DesmosEditorProvider {
  constructor(context, { sessionRegistry, rpcBroker }) {
    this.context = context;
    this.fileService = new FileService();
    this.sessionRegistry = sessionRegistry;
    this.rpcBroker = rpcBroker;
    this.documents = new Map();
    this.panels = new Set();
    this.mcpController = undefined;
    this._onDidChangeCustomDocument = new vscode.EventEmitter();
  }

  setMcpController(controller) {
    this.mcpController = controller;
  }

  get onDidChangeCustomDocument() {
    return this._onDidChangeCustomDocument.event;
  }

  /** Opens a standalone calculator panel that is not associated with a file. */
  openCalculator() {
    const panel = vscode.window.createWebviewPanel(
      'desmos.calculator',
      'Desmos Calculator',
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
    this.configurePanel(panel, document, 'standalone');
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
    this.configurePanel(webviewPanel, document, 'document');
  }

  /** Configures the Webview shared by custom editors and standalone calculators. */
  configurePanel(webviewPanel, document, kind) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    webviewPanel.webview.html = createWebviewHtml(
      webviewPanel.webview,
      this.context.extensionUri,
      document.content,
      { mcpStatus: this.mcpController?.getStatus?.() }
    );

    const router = new MessageRouter({
      panel: webviewPanel,
      document,
      fileService: this.fileService
    });
    const session = this.sessionRegistry.register({ panel: webviewPanel, document, kind });
    this.panels.add(webviewPanel);
    const documentDisposable = document.onDidChange(() => this.sessionRegistry.incrementRevision(session.sessionId));
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(message => {
      if (message.type === 'calculatorRpcResponse') this.rpcBroker.resolve(message);
      if (message.type === 'mcp:setEnabled') {
        void this.mcpController?.setEnabled(message.enabled).then(() => this.postMcpStatus(webviewPanel));
      }
      if (message.type === 'mcp:info') void this.mcpController?.showInfo();
    });
    webviewPanel.onDidChangeViewState(event => {
      if (event.webviewPanel.active) this.sessionRegistry.touch(session.sessionId);
    });
    webviewPanel.onDidDispose(() => {
      router.dispose();
      messageDisposable.dispose();
      documentDisposable.dispose();
      this.sessionRegistry.unregister(session.sessionId);
      this.panels.delete(webviewPanel);
      if (kind === 'standalone') document.dispose();
    });
  }

  postMcpStatus(panel) {
    const status = this.mcpController?.getStatus?.();
    if (status) void panel.webview.postMessage({ type: 'mcpStatus', status });
  }

  updateMcpStatus(status) {
    for (const panel of this.panels) void panel.webview.postMessage({ type: 'mcpStatus', status });
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
    this.panels.clear();
  }
}

module.exports = { DesmosEditorProvider };
