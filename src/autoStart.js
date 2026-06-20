const { app } = require('electron');

class AutoStart {
  /**
   * 启用开机自启
   */
  enable() {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        path: process.execPath,
        args: []
      });
      return true;
    } catch (e) {
      console.error('启用开机自启失败:', e.message);
      return false;
    }
  }

  /**
   * 禁用开机自启
   */
  disable() {
    try {
      app.setLoginItemSettings({
        openAtLogin: false,
        path: process.execPath,
        args: []
      });
      return true;
    } catch (e) {
      console.error('禁用开机自启失败:', e.message);
      return false;
    }
  }

  /**
   * 检查是否已启用开机自启
   */
  isEnabled() {
    try {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    } catch (e) {
      return false;
    }
  }
}

module.exports = AutoStart;
