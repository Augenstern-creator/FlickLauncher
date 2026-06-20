const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

class TrayManager {
  constructor(mainWindow, store) {
    this.mainWindow = mainWindow;
    this.store = store;
    this.tray = null;

    this.createTray();
  }

  createTray() {
    // 创建托盘图标
    let iconPath = path.join(__dirname, '..', 'renderer', 'icons', 'default-icon.png');

    // 如果图标文件不存在，创建一个简单的图标
    let trayIcon;
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      // 创建一个简单的 16x16 图标
      trayIcon = nativeImage.createEmpty();
    }

    // 调整图标大小
    trayIcon = trayIcon.resize({ width: 16, height: 16 });

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Flick Launcher - 桌面快速启动器');

    this.updateContextMenu();
  }

  updateContextMenu() {
    const recentShortcuts = this.store.getRecent().slice(0, 5);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示 Flick Launcher',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      ...(recentShortcuts.length > 0 ? [
        { label: '最近使用', enabled: false },
        ...recentShortcuts.map(s => ({
          label: `  ${s.name}`,
          click: () => {
            const { shell } = require('electron');
            shell.openPath(s.path).then(() => {
              this.store.recordUsage(s.id);
            });
          }
        })),
        { type: 'separator' }
      ] : []),
      {
        label: '退出',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * 双击托盘图标显示窗口
   */
  setupDoubleClick() {
    if (this.tray) {
      this.tray.on('double-click', () => {
        if (this.mainWindow) {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      });
    }
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
