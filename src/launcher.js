const { shell } = require('electron');
const fs = require('fs');

class Launcher {
  constructor(store) {
    this.store = store;
  }

  /**
   * 启动程序、文件或 URL
   * @param {string} target - 程序/文件路径或 URL
   * @param {string} type - 类型：'file' 或 'url'
   * @returns {object} - { success: boolean, error?: string }
   */
  async launch(target, type = 'file') {
    if (!target) {
      return { success: false, error: '路径为空' };
    }

    // URL 类型直接使用浏览器打开
    if (type === 'url' || /^https?:\/\//i.test(target)) {
      try {
        await shell.openExternal(target);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    // 文件类型
    const normalizedPath = process.platform === 'win32'
      ? target.replace(/\//g, '\\')
      : target;

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
