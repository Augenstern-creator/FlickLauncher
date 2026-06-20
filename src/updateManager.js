const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

class UpdateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.updateAvailable = false;
    this.downloadProgress = 0;
    this.checkTimeout = null;

    this.init();
  }

  init() {
    // 禁用自动下载，让用户决定
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // 检查更新
    autoUpdater.on('checking-for-update', () => {
      this.sendStatus('checking');
    });

    // 发现新版本
    autoUpdater.on('update-available', (info) => {
      this.clearCheckTimeout();
      this.updateAvailable = true;
      this.sendStatus('available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
    });

    // 当前已是最新版本
    autoUpdater.on('update-not-available', (info) => {
      this.clearCheckTimeout();
      this.updateAvailable = false;
      this.sendStatus('up-to-date', {
        version: info.version
      });
    });

    // 下载进度
    autoUpdater.on('download-progress', (progress) => {
      this.downloadProgress = progress.percent;
      this.sendStatus('downloading', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred
      });
    });

    // 下载完成
    autoUpdater.on('update-downloaded', (info) => {
      this.sendStatus('downloaded', {
        version: info.version
      });
    });

    // 错误
    autoUpdater.on('error', (err) => {
      this.clearCheckTimeout();
      this.sendStatus('error', {
        message: err.message
      });
    });
  }

  sendStatus(status, data = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { status, ...data });
    }
  }

  clearCheckTimeout() {
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
  }

  // 检查更新
  checkForUpdates() {
    // 清除之前的超时定时器
    this.clearCheckTimeout();

    // 设置超时时间（15秒）
    this.checkTimeout = setTimeout(() => {
      this.sendStatus('error', { message: '检查更新超时，请检查网络连接' });
    }, 15000);

    return autoUpdater.checkForUpdates();
  }

  // 下载更新
  downloadUpdate() {
    return autoUpdater.downloadUpdate();
  }

  // 安装更新
  quitAndInstall() {
    autoUpdater.quitAndInstall();
  }
}

module.exports = UpdateManager;
