const vscode = require('vscode');

/**
 * File service: centralizes VS Code file APIs and file-picker dialogs.
 * The extension host owns file I/O; the Webview never accesses Node.js file APIs directly.
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
      openLabel: 'Open Desmos Graph',
      filters: { 'Desmos Files': ['des'] }
    });
    return result && result[0];
  }

  async chooseSaveFile(title) {
    const result = await vscode.window.showSaveDialog({
      saveLabel: title,
      filters: { 'Desmos Files': ['des'] }
    });
    return result;
  }

  async choosePngFile() {
    const result = await vscode.window.showSaveDialog({
      saveLabel: 'Export Image',
      filters: { PNG: ['png'] }
    });
    return result;
  }

  async writePng(uri, dataUrl) {
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
    if (!match) throw new Error('Invalid PNG data');
    await vscode.workspace.fs.writeFile(uri, Buffer.from(match[1], 'base64'));
  }
}

module.exports = { FileService };
