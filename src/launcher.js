const { shell } = require('electron');
const fs = require('fs');

class Launcher {
  constructor(store) {
    this.store = store;
  }

  /**
   * 启动程序或文件
   * @param {string} targetPath - 程序或文件的路径
   * @returns {object} - { success: boolean, error?: string }
   */
  async launch(targetPath) {
    if (!targetPath) {
      return { success: false, error: '路径为空' };
    }

    // 规范化路径（仅 Windows）
    const normalizedPath = process.platform === 'win32'
      ? targetPath.replace(/\//g, '\\')
      : targetPath;

    // 异步检查路径是否存在
    try {
      await fs.promises.access(normalizedPath, fs.constants.F_OK);
    } catch (e) {
      return { success: false, error: `文件不存在: ${normalizedPath}` };
    }

    try {
      const result = await shell.openPath(normalizedPath);
      if (result) {
        return { success: false, error: result };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = Launcher;
