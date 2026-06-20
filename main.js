const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./src/store');
const Launcher = require('./src/launcher');
const TrayManager = require('./src/tray');
const AutoStart = require('./src/autoStart');
const GlobalShortcutManager = require('./src/globalShortcut');
const IconExtractor = require('./src/iconExtractor');

let mainWindow = null;
let trayManager = null;
let store = null;
let launcher = null;
let autoStart = null;
let globalShortcutManager = null;
let iconExtractor = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    frame: false, // 无边框窗口
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'renderer/icons/default-icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 窗口关闭时隐藏到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initializeModules() {
  // 初始化数据存储
  store = new Store();

  // 初始化启动器
  launcher = new Launcher(store);

  // 初始化图标提取器
  iconExtractor = new IconExtractor(store);

  // 初始化开机自启
  autoStart = new AutoStart();

  // 初始化系统托盘
  trayManager = new TrayManager(mainWindow, store);

  // 初始化全局快捷键
  globalShortcutManager = new GlobalShortcutManager(mainWindow, store);
}

// 注册 IPC 处理函数
function registerIpcHandlers() {
  // 窗口控制
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.hide();
  });

  // 获取所有快捷方式
  ipcMain.handle('get-shortcuts', () => {
    return store.getShortcuts();
  });

  // 获取所有分类
  ipcMain.handle('get-categories', () => {
    return store.getCategories();
  });

  // 获取设置
  ipcMain.handle('get-settings', () => {
    return store.getSettings();
  });

  // 获取最近使用
  ipcMain.handle('get-recent', () => {
    return store.getRecent();
  });

  // 添加快捷方式
  ipcMain.handle('add-shortcut', async (event, shortcutData) => {
    // 检查是否重复添加（路径相同）
    const existing = store.getShortcuts();
    const duplicate = existing.find(s =>
      s.path.toLowerCase() === shortcutData.path.toLowerCase()
    );
    if (duplicate) {
      return { error: 'duplicate', message: `"${duplicate.name}" 已添加，请勿重复添加` };
    }

    const result = store.addShortcut(shortcutData);
    // 尝试提取图标
    if (shortcutData.path && shortcutData.path.toLowerCase().endsWith('.exe')) {
      const iconPath = await iconExtractor.extractIcon(shortcutData.path);
      if (iconPath) {
        store.updateShortcut(result.id, { icon: iconPath });
        result.icon = iconPath;
      }
    }
    return result;
  });

  // 更新快捷方式
  ipcMain.handle('update-shortcut', (event, id, updates) => {
    return store.updateShortcut(id, updates);
  });

  // 删除快捷方式
  ipcMain.handle('delete-shortcut', (event, id) => {
    return store.deleteShortcut(id);
  });

  // 启动程序/文件
  ipcMain.handle('launch-shortcut', (event, id) => {
    const shortcut = store.getShortcutById(id);
    if (shortcut) {
      store.recordUsage(id);
      return launcher.launch(shortcut.path);
    }
    return { success: false, error: '快捷方式不存在' };
  });

  // 添加分类
  ipcMain.handle('add-category', (event, categoryData) => {
    return store.addCategory(categoryData);
  });

  // 更新分类
  ipcMain.handle('update-category', (event, id, updates) => {
    return store.updateCategory(id, updates);
  });

  // 删除分类
  ipcMain.handle('delete-category', (event, id) => {
    return store.deleteCategory(id);
  });

  // 更新设置
  ipcMain.handle('update-settings', (event, settings) => {
    const oldSettings = store.getSettings();
    const result = store.updateSettings(settings);

    // 如果主题改变，通知渲染进程
    if (settings.theme && settings.theme !== oldSettings.theme) {
      mainWindow?.webContents.send('theme-changed', settings.theme);
    }

    // 如果全局快捷键改变，重新注册
    if (settings.globalShortcut && settings.globalShortcut !== oldSettings.globalShortcut) {
      globalShortcutManager.updateShortcut(settings.globalShortcut);
    }

    // 如果开机自启改变
    if (settings.autoStart !== undefined && settings.autoStart !== oldSettings.autoStart) {
      if (settings.autoStart) {
        autoStart.enable();
      } else {
        autoStart.disable();
      }
    }

    return result;
  });

  // 选择文件
  // 选择文件或文件夹
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: '可执行文件', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // 选择图标
  ipcMain.handle('select-icon', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '图标文件', extensions: ['ico', 'png', 'jpg', 'jpeg'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // 导出配置
  ipcMain.handle('export-config', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'flick-launcher-config.json',
      filters: [{ name: 'JSON文件', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePath) {
      return store.exportConfig(result.filePath);
    }
    return { success: false, error: '取消导出' };
  });

  // 导入配置
  ipcMain.handle('import-config', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'JSON文件', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return store.importConfig(result.filePaths[0]);
    }
    return { success: false, error: '取消导入' };
  });

  // 获取文件信息（用于自动填充名称）
  ipcMain.handle('get-file-info', (event, filePath) => {
    try {
      const basename = path.basename(filePath);
      const name = path.parse(basename).name;
      const ext = path.parse(basename).ext.toLowerCase();
      return { name, ext, basename };
    } catch (e) {
      return null;
    }
  });
}

// 应用启动
app.whenReady().then(() => {
  createWindow();
  initializeModules();
  registerIpcHandlers();

  // 初始化开机自启状态
  const settings = store.getSettings();
  if (settings.autoStart) {
    autoStart.enable();
  }
});

// 所有窗口关闭时（macOS 除外）退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 不退出，保持托盘运行
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// 退出前清理
app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcutManager?.unregisterAll();
  trayManager?.destroy();
});
