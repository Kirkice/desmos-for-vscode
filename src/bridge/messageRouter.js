const vscode = require('vscode');

/**
 * Webview message router.
 * Each handler owns a single use case to keep Provider classes small and focused.
 */
class MessageRouter {
  constructor({ panel, document, fileService }) {
    this.panel = panel;
    this.document = document;
    this.fileService = fileService;
    this._disposable = panel.webview.onDidReceiveMessage(message => this.route(message));
  }

  async route(message) {
    try {
      switch (message.type) {
        case 'documentChanged':
          this.document.update(message.content);
          break;
        case 'save':
          await this.save(message.content, false);
          break;
        case 'saveAs':
          await this.save(message.content, true);
          break;
        case 'open':
          await this.open();
          break;
        case 'export':
          await this.exportPng(message.dataUrl);
          break;
        case 'info':
          vscode.window.showInformationMessage('Desmos Offline Graphing Calculator');
          break;
        case 'calculatorRpcResponse':
          // Handled by CalculatorRpcBroker through the panel-level listener.
          break;
        default:
          this.notify('Unsupported action');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Desmos operation failed: ${error.message}`);
      this.notify('Operation failed');
    }
  }

  async save(content, saveAs) {
    let target = this.document.uri;
    if (saveAs || !target || target.scheme === 'untitled') {
      target = await this.fileService.chooseSaveFile('Save Desmos Graph');
    }
    if (!target) return;

    await this.fileService.write(target, content);
    this.document.markSaved(content);
    this.panel.webview.postMessage({ type: 'saved' });
    this.notify('Saved');
  }

  async open() {
    const target = await this.fileService.chooseOpenFile();
    if (!target) return;
    const content = await this.fileService.read(target);
    this.panel.webview.postMessage({ type: 'load', content });
    this.document.markSaved(content);
    this.notify('Loaded');
  }

  async exportPng(dataUrl) {
    const target = await this.fileService.choosePngFile();
    if (!target) return;
    await this.fileService.writePng(target, dataUrl);
    this.notify('PNG exported');
  }

  notify(text) {
    this.panel.webview.postMessage({ type: 'notify', text });
  }

  dispose() {
    this._disposable.dispose();
  }
}

module.exports = { MessageRouter };
