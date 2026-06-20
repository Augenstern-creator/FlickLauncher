const { globalShortcut } = require('electron');

class GlobalShortcutManager {
  constructor(mainWindow, store) {
    this.mainWindow = mainWindow;
    this.store = store;
    this.currentShortcut = null;

    // 注册默认快捷键
    const settings = this.store.getSettings();
    if (settings.globalShortcut) {
      this.registerShortcut(settings.globalShortcut);
    }
  }

  /**
   * 注册全局快捷键
   * @param {string} accelerator - 快捷键字符串，如 'CommandOrControl+Shift+Space'
   */
  registerShortcut(accelerator) {
    // 先取消之前的快捷键
    this.unregisterAll();

    try {
      const success = globalShortcut.register(accelerator, () => {
        this.toggleWindow();
      });

      if (success) {
        this.currentShortcut = accelerator;
        console.log(`全局快捷键已注册: ${accelerator}`);
      } else {
        console.error(`全局快捷键注册失败: ${accelerator}`);
      }
    } catch (e) {
      console.error(`全局快捷键注册错误: ${e.message}`);
    }
  }

  /**
   * 更新全局快捷键
   * @param {string} newAccelerator - 新的快捷键字符串
   */
  updateShortcut(newAccelerator) {
    this.registerShortcut(newAccelerator);
  }

  /**
   * 取消所有全局快捷键
   */
  unregisterAll() {
    if (this.currentShortcut) {
      globalShortcut.unregister(this.currentShortcut);
      this.currentShortcut = null;
    }
  }

  /**
   * 切换窗口显示/隐藏
   */
  toggleWindow() {
    if (!this.mainWindow) return;

    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }
}

module.exports = GlobalShortcutManager;
