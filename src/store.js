const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const schema = {
  shortcuts: {
    type: 'array',
    default: []
  },
  categories: {
    type: 'array',
    default: [
      { id: 'tools', name: '常用工具', order: 0 },
      { id: 'web', name: '常用网页', order: 1 },
      { id: 'folders', name: '常用文件夹', order: 2 },
      { id: 'notes', name: '常用笔记', order: 3 }
    ]
  },
  settings: {
    type: 'object',
    default: {
      theme: 'dark',
      autoStart: false,
      globalShortcut: 'CommandOrControl+Shift+Space',
      recentCount: 10
    }
  },
  recentUsage: {
    type: 'array',
    default: []
  }
};

class DataStore {
  constructor() {
    this.store = new Store({
      name: 'flick-launcher-config',
      schema,
      clearInvalidConfig: true
    });
  }

  // ========== 快捷方式操作 ==========

  getShortcuts() {
    return this.store.get('shortcuts', []);
  }

  getShortcutById(id) {
    const shortcuts = this.getShortcuts();
    return shortcuts.find(s => s.id === id) || null;
  }

  addShortcut(data) {
    const shortcuts = this.getShortcuts();
    const shortcut = {
      id: uuidv4(),
      name: data.name || '未命名',
      path: data.path || '',
      icon: data.icon || null,
      category: data.category || 'folders',
      order: data.order !== undefined ? data.order : shortcuts.length,
      addedAt: new Date().toISOString(),
      lastUsed: null,
      useCount: 0
    };
    shortcuts.push(shortcut);
    this.store.set('shortcuts', shortcuts);
    return shortcut;
  }

  updateShortcut(id, updates) {
    const shortcuts = this.getShortcuts();
    const index = shortcuts.findIndex(s => s.id === id);
    if (index === -1) return null;

    shortcuts[index] = { ...shortcuts[index], ...updates };
    this.store.set('shortcuts', shortcuts);
    return shortcuts[index];
  }

  deleteShortcut(id) {
    const shortcuts = this.getShortcuts();
    const filtered = shortcuts.filter(s => s.id !== id);
    if (filtered.length === shortcuts.length) return false;
    this.store.set('shortcuts', filtered);

    // 同时从最近使用中移除
    const recent = this.getRecentUsage();
    this.store.set('recentUsage', recent.filter(r => r.id !== id));
    return true;
  }

  // ========== 分类操作 ==========

  getCategories() {
    return this.store.get('categories', []).sort((a, b) => a.order - b.order);
  }

  addCategory(data) {
    const categories = this.getCategories();
    const category = {
      id: data.id || uuidv4(),
      name: data.name || '新分类',
      order: data.order !== undefined ? data.order : categories.length
    };
    categories.push(category);
    this.store.set('categories', categories);
    return category;
  }

  updateCategory(id, updates) {
    const categories = this.getCategories();
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) return null;

    categories[index] = { ...categories[index], ...updates };
    this.store.set('categories', categories);
    return categories[index];
  }

  deleteCategory(id) {
    const categories = this.getCategories();
    const filtered = categories.filter(c => c.id !== id);
    if (filtered.length === categories.length) return false;
    this.store.set('categories', filtered);

    // 将该分类下的快捷方式移到默认分类
    const shortcuts = this.getShortcuts();
    const updated = shortcuts.map(s => {
      if (s.category === id) {
        return { ...s, category: 'folders' };
      }
      return s;
    });
    this.store.set('shortcuts', updated);
    return true;
  }

  // ========== 设置操作 ==========

  getSettings() {
    return this.store.get('settings');
  }

  updateSettings(updates) {
    const settings = this.getSettings();
    const newSettings = { ...settings, ...updates };
    this.store.set('settings', newSettings);
    return newSettings;
  }

  // ========== 最近使用 ==========

  getRecentUsage() {
    return this.store.get('recentUsage', []);
  }

  getRecent() {
    const recent = this.getRecentUsage();
    const settings = this.getSettings();
    const count = settings.recentCount || 10;
    // 批量读取，避免 N+1
    const shortcuts = this.getShortcuts();
    const map = new Map(shortcuts.map(s => [s.id, s]));
    return recent.slice(0, count).map(r => map.get(r.id)).filter(Boolean);
  }

  recordUsage(id) {
    let recent = this.getRecentUsage();
    // 移除已有记录
    recent = recent.filter(r => r.id !== id);
    // 添加到顶部
    recent.unshift({ id, usedAt: new Date().toISOString() });
    // 限制长度
    const settings = this.getSettings();
    recent = recent.slice(0, (settings.recentCount || 10) * 2);
    this.store.set('recentUsage', recent);

    // 更新快捷方式的使用次数和最后使用时间（复用 updateShortcut）
    const shortcut = this.getShortcutById(id);
    if (shortcut) {
      this.updateShortcut(id, {
        lastUsed: new Date().toISOString(),
        useCount: (shortcut.useCount || 0) + 1
      });
    }
  }

  // ========== 导入导出 ==========

  exportConfig(filePath) {
    try {
      const config = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        shortcuts: this.getShortcuts(),
        categories: this.getCategories(),
        settings: this.getSettings()
      };
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
      return { success: true, path: filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  importConfig(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);

      if (config.version !== '1.0') {
        return { success: false, error: '不支持的配置版本' };
      }

      // 导入快捷方式（批量写入）
      if (config.shortcuts && Array.isArray(config.shortcuts)) {
        const existing = this.getShortcuts();
        const existingPaths = new Set(existing.map(s => s.path));
        const newShortcuts = config.shortcuts
          .filter(s => !existingPaths.has(s.path))
          .map(s => ({ ...s, id: uuidv4() }));
        if (newShortcuts.length > 0) {
          this.store.set('shortcuts', [...existing, ...newShortcuts]);
        }
      }

      // 导入分类（批量写入）
      if (config.categories && Array.isArray(config.categories)) {
        const existing = this.getCategories();
        const existingIds = new Set(existing.map(c => c.id));
        const newCategories = config.categories.filter(c => !existingIds.has(c.id));
        if (newCategories.length > 0) {
          this.store.set('categories', [...existing, ...newCategories]);
        }
      }

      return { success: true, message: '导入成功' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = DataStore;
