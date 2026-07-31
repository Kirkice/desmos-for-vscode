const vscode = require('vscode');

/**
 * 文件服务：统一封装 VS Code 文件系统和文件选择对话框。
 * 宿主层负责所有文件 IO，Webview 不直接接触 Node.js 文件系统。
 */
class FileService {
  async read(uri) {
    if (uri.scheme === 'untitled') return '';
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  }

  async write(uri, content) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  }

  async chooseOpenFile() {
    const result = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: '打开 Desmos 图形',
      filters: { 'Desmos 文件': ['des'] }
    });
    return result && result[0];
  }

  async chooseSaveFile(title) {
    const result = await vscode.window.showSaveDialog({
      saveLabel: title,
      filters: { 'Desmos 文件': ['des'] }
    });
    return result;
  }

  async choosePngFile() {
    const result = await vscode.window.showSaveDialog({
      saveLabel: '导出图像',
      filters: { PNG: ['png'] }
    });
    return result;
  }

  async writePng(uri, dataUrl) {
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
    if (!match) throw new Error('无效的 PNG 数据');
    await vscode.workspace.fs.writeFile(uri, Buffer.from(match[1], 'base64'));
  }
}

module.exports = { FileService };
