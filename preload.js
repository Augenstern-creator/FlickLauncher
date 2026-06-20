const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // 快捷方式操作
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  addShortcut: (data) => ipcRenderer.invoke('add-shortcut', data),
  updateShortcut: (id, updates) => ipcRenderer.invoke('update-shortcut', id, updates),
  deleteShortcut: (id) => ipcRenderer.invoke('delete-shortcut', id),
  launchShortcut: (id) => ipcRenderer.invoke('launch-shortcut', id),

  // 分类操作
  getCategories: () => ipcRenderer.invoke('get-categories'),
  addCategory: (data) => ipcRenderer.invoke('add-category', data),
  updateCategory: (id, updates) => ipcRenderer.invoke('update-category', id, updates),
  deleteCategory: (id) => ipcRenderer.invoke('delete-category', id),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),

  // 最近使用
  getRecent: () => ipcRenderer.invoke('get-recent'),

  // 文件选择
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectIcon: () => ipcRenderer.invoke('select-icon'),
  getFileInfo: (path) => ipcRenderer.invoke('get-file-info', path),

  // 数据路径
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  selectDataFolder: () => ipcRenderer.invoke('select-data-folder'),
  migrateData: (newPath) => ipcRenderer.invoke('migrate-data', newPath),

  // 打开外部链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // 导入导出
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),

  // 更新日志 & 版本
  getChangelog: () => ipcRenderer.invoke('get-changelog'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 自动更新
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // 更新状态监听
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },

  // 事件监听
  onThemeChanged: (callback) => {
    const handler = (_event, theme) => callback(theme);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  },
  onWindowStateChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window-state-changed', handler);
    return () => ipcRenderer.removeListener('window-state-changed', handler);
  }
});
