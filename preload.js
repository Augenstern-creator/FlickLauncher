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
  selectIcon: () => ipcRenderer.invoke('select-icon'),
  getFileInfo: (path) => ipcRenderer.invoke('get-file-info', path),

  // 导入导出
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),

  // 事件监听
  onThemeChanged: (callback) => {
    const handler = (_event, theme) => callback(theme);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  }
});
