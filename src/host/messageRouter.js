const vscode = require('vscode');

/**
 * Webview 消息路由器。
 * 每个消息处理器只完成一类用例，避免在 Provider 中堆积大量分支逻辑。
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
          vscode.window.showInformationMessage('Desmos 离线图形计算器');
          break;
        default:
          this.notify('不支持的操作');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Desmos 操作失败：${error.message}`);
      this.notify('操作失败');
    }
  }

  async save(content, saveAs) {
    let target = this.document.uri;
    if (saveAs || !target || target.scheme === 'untitled') {
      target = await this.fileService.chooseSaveFile('保存 Desmos 图形');
    }
    if (!target) return;

    await this.fileService.write(target, content);
    this.document.markSaved(content);
    this.panel.webview.postMessage({ type: 'saved' });
    this.notify('已保存');
  }

  async open() {
    const target = await this.fileService.chooseOpenFile();
    if (!target) return;
    const content = await this.fileService.read(target);
    this.panel.webview.postMessage({ type: 'load', content });
    this.document.markSaved(content);
    this.notify('已加载');
  }

  async exportPng(dataUrl) {
    const target = await this.fileService.choosePngFile();
    if (!target) return;
    await this.fileService.writePng(target, dataUrl);
    this.notify('PNG 已导出');
  }

  notify(text) {
    this.panel.webview.postMessage({ type: 'notify', text });
  }

  dispose() {
    this._disposable.dispose();
  }
}

module.exports = { MessageRouter };
