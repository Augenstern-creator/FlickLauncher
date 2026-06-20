// ========== 状态管理 ==========
let shortcuts = [];
let categories = [];
let settings = {};
let recentItems = [];
let currentCategory = 'all';
let contextMenuTarget = null;

// ========== 工具函数 ==========

function getSearchFilter() {
  return document.getElementById('search-input').value;
}

function setIconWithFallback(imgEl, src) {
  imgEl.src = src || 'icons/default-icon.png';
  imgEl.onerror = () => { imgEl.src = 'icons/default-icon.png'; };
}

// ========== 初始化 ==========
async function init() {
  try {
    // 并行加载数据
    [shortcuts, categories, settings, recentItems] = await Promise.all([
      window.electronAPI.getShortcuts(),
      window.electronAPI.getCategories(),
      window.electronAPI.getSettings(),
      window.electronAPI.getRecent()
    ]);

    // 应用主题
    applyTheme(settings.theme || 'dark');

    // 渲染界面
    renderCategoryTabs();
    renderRecent();
    renderShortcuts();

    // 绑定事件
    bindEvents();

    console.log('Flick Launcher 已初始化');
  } catch (e) {
    console.error('初始化失败:', e);
  }
}

// ========== 渲染函数 ==========

function renderCategoryTabs() {
  const tabList = document.querySelector('.tab-list');
  tabList.innerHTML = '<button class="tab-btn active" data-category="all">全部</button>';

  for (const cat of categories) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.category = cat.id;
    btn.textContent = cat.name;
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showCategoryContextMenu(e, cat);
    });
    tabList.appendChild(btn);
  }

  // 绑定点击事件
  tabList.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.category;
      tabList.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderShortcuts();
    });
  });
}

function renderRecent() {
  const recentList = document.getElementById('recent-list');
  const recentSection = document.getElementById('recent-section');

  if (recentItems.length === 0) {
    recentSection.style.display = 'none';
    return;
  }

  recentSection.style.display = 'block';
  recentList.innerHTML = '';

  for (const item of recentItems) {
    const el = document.createElement('div');
    el.className = 'recent-item';
    el.title = item.path;

    const icon = document.createElement('img');
    setIconWithFallback(icon, item.icon);

    const name = document.createElement('span');
    name.textContent = item.name;

    el.appendChild(icon);
    el.appendChild(name);
    el.addEventListener('click', () => launchShortcut(item.id));
    recentList.appendChild(el);
  }
}

function renderShortcuts(filter = '') {
  const grid = document.getElementById('shortcut-grid');
  grid.innerHTML = '';

  let filtered = shortcuts;

  // 按分类过滤
  if (currentCategory !== 'all') {
    filtered = filtered.filter(s => s.category === currentCategory);
  }

  // 按搜索过滤
  if (filter) {
    const q = filter.toLowerCase();
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.path.toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="grid-empty">
        <p>${filter ? '没有匹配的结果' : '还没有快捷方式'}</p>
        <p class="empty-hint">${filter ? '试试其他关键词' : '点击右上角 ➕ 添加你的第一个快捷方式'}</p>
      </div>
    `;
    return;
  }

  // 按 order 排序
  filtered.sort((a, b) => (a.order || 0) - (b.order || 0));

  for (const shortcut of filtered) {
    const card = createShortcutCard(shortcut);
    grid.appendChild(card);
  }
}

function createShortcutCard(shortcut) {
  const card = document.createElement('div');
  card.className = 'shortcut-card';
  card.dataset.id = shortcut.id;
  card.draggable = true;
  card.title = shortcut.path;

  const icon = document.createElement('img');
  icon.className = 'shortcut-icon';
  setIconWithFallback(icon, shortcut.icon);
  icon.draggable = false;

  const name = document.createElement('div');
  name.className = 'shortcut-name';
  name.textContent = shortcut.name;

  card.appendChild(icon);
  card.appendChild(name);

  // 点击启动
  card.addEventListener('click', (e) => {
    if (e.button === 0) { // 左键
      launchShortcut(shortcut.id);
    }
  });

  // 右键菜单
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e, shortcut);
  });

  // 拖拽
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', shortcut.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== shortcut.id) {
      reorderShortcuts(sourceId, shortcut.id);
    }
  });

  return card;
}

// ========== 操作函数 ==========

async function launchShortcut(id) {
  try {
    const result = await window.electronAPI.launchShortcut(id);
    if (!result.success) {
      showNotification(`启动失败: ${result.error}`, 'error');
    } else {
      // 更新最近使用
      recentItems = await window.electronAPI.getRecent();
      renderRecent();
    }
  } catch (e) {
    showNotification('启动失败', 'error');
  }
}

async function addShortcut(data) {
  try {
    const result = await window.electronAPI.addShortcut(data);
    // 检查是否重复
    if (result && result.error === 'duplicate') {
      showNotification(result.message, 'error');
      return false;
    }
    shortcuts.push(result);
    renderShortcuts(getSearchFilter());
    showNotification(`已添加: ${result.name}`);
    return true;
  } catch (e) {
    showNotification('添加失败', 'error');
    return false;
  }
}

async function deleteShortcut(id) {
  try {
    const result = await window.electronAPI.deleteShortcut(id);
    if (result) {
      shortcuts = shortcuts.filter(s => s.id !== id);
      recentItems = await window.electronAPI.getRecent();
      renderShortcuts(getSearchFilter());
      renderRecent();
      showNotification('已删除');
    }
  } catch (e) {
    showNotification('删除失败', 'error');
  }
}

async function updateShortcut(id, updates) {
  try {
    const result = await window.electronAPI.updateShortcut(id, updates);
    if (result) {
      const index = shortcuts.findIndex(s => s.id === id);
      if (index !== -1) {
        shortcuts[index] = result;
      }
      renderShortcuts(getSearchFilter());
    }
    return result;
  } catch (e) {
    showNotification('更新失败', 'error');
    return null;
  }
}

async function reorderShortcuts(sourceId, targetId) {
  const sourceIdx = shortcuts.findIndex(s => s.id === sourceId);
  const targetIdx = shortcuts.findIndex(s => s.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1) return;

  // 并行交换排序值，最后统一渲染
  await Promise.all([
    window.electronAPI.updateShortcut(sourceId, { order: shortcuts[targetIdx].order }),
    window.electronAPI.updateShortcut(targetId, { order: shortcuts[sourceIdx].order })
  ]);

  shortcuts[sourceIdx].order = shortcuts[targetIdx].order;
  shortcuts[targetIdx].order = shortcuts[sourceIdx].order;
  renderShortcuts(getSearchFilter());
}

async function addCategory(name) {
  try {
    const result = await window.electronAPI.addCategory({ name });
    categories.push(result);
    renderCategoryTabs();
    showNotification(`已创建分类: ${name}`);
  } catch (e) {
    showNotification('创建分类失败', 'error');
  }
}

async function deleteCategory(id) {
  try {
    const result = await window.electronAPI.deleteCategory(id);
    if (result) {
      categories = categories.filter(c => c.id !== id);
      if (currentCategory === id) {
        currentCategory = 'all';
      }
      renderCategoryTabs();
      renderShortcuts(getSearchFilter());
      showNotification('已删除分类');
    }
  } catch (e) {
    showNotification('删除分类失败', 'error');
  }
}

// ========== 主题 ==========

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const themeBtn = document.getElementById('btn-theme');
  themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

async function toggleTheme() {
  const current = settings.theme || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  settings.theme = newTheme;
  applyTheme(newTheme);
  await window.electronAPI.updateSettings({ theme: newTheme });
}

// ========== 弹窗控制 ==========

function showModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

function hideModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

function hideAllModals() {
  document.querySelectorAll('.modal, .settings-panel').forEach(m => {
    m.style.display = 'none';
  });
  hideContextMenu();
}

// ========== 右键菜单 ==========

function showContextMenu(e, shortcut) {
  contextMenuTarget = shortcut;
  const menu = document.getElementById('context-menu');
  menu.style.display = 'block';

  // 定位
  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 200);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function showCategoryContextMenu(e, category) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.display = 'block';
  menu.innerHTML = `
    <div class="context-menu-item" data-action="rename-cat">✏️ 重命名</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" data-action="delete-cat">🗑️ 删除分类</div>
  `;

  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 100);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  document.body.appendChild(menu);

  menu.addEventListener('click', async (ev) => {
    const action = ev.target.dataset.action;
    if (action === 'rename-cat') {
      const newName = prompt('输入新分类名称:', category.name);
      if (newName && newName.trim()) {
        await window.electronAPI.updateCategory(category.id, { name: newName.trim() });
        category.name = newName.trim();
        renderCategoryTabs();
      }
    } else if (action === 'delete-cat') {
      if (confirm(`确定删除分类 "${category.name}" 吗？\n该分类下的快捷方式将移至"常用文件夹"分类。`)) {
        await deleteCategory(category.id);
      }
    }
    document.body.removeChild(menu);
  });

  // 点击其他区域关闭
  setTimeout(() => {
    document.addEventListener('click', function handler() {
      if (document.body.contains(menu)) {
        document.body.removeChild(menu);
      }
      document.removeEventListener('click', handler);
    });
  }, 0);
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
  contextMenuTarget = null;
}

// ========== 通知 ==========

function showNotification(text, type = 'info') {
  const el = document.getElementById('notification');
  const textEl = document.getElementById('notification-text');
  textEl.textContent = text;
  el.style.display = 'block';

  if (type === 'error') {
    el.style.background = 'var(--danger)';
  } else {
    el.style.background = 'var(--notification-bg)';
  }

  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

// ========== 事件绑定 ==========

function bindEvents() {
  // 窗口控制
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.electronAPI.minimize();
  });
  document.getElementById('btn-maximize').addEventListener('click', () => {
    window.electronAPI.maximize();
  });
  document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI.close();
  });

  // 主题切换
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // 添加快捷方式
  document.getElementById('btn-add').addEventListener('click', () => {
    document.getElementById('add-path').value = '';
    document.getElementById('add-name').value = '';
    document.getElementById('add-icon').value = '';
    // 更新分类下拉
    const select = document.getElementById('add-category');
    select.innerHTML = categories.map(c =>
      `<option value="${c.id}">${c.name}</option>`
    ).join('');
    showModal('modal-add');
  });

  document.getElementById('btn-browse-file').addEventListener('click', async () => {
    const filePath = await window.electronAPI.selectFile();
    if (filePath) {
      document.getElementById('add-path').value = filePath;
      // 自动填充名称
      const info = await window.electronAPI.getFileInfo(filePath);
      if (info) {
        document.getElementById('add-name').value = info.name;
      }
    }
  });

  document.getElementById('btn-browse-icon').addEventListener('click', async () => {
    const iconPath = await window.electronAPI.selectIcon();
    if (iconPath) {
      document.getElementById('add-icon').value = iconPath;
    }
  });

  document.getElementById('btn-cancel-add').addEventListener('click', () => {
    hideModal('modal-add');
  });

  document.getElementById('btn-confirm-add').addEventListener('click', async () => {
    const path = document.getElementById('add-path').value;
    const name = document.getElementById('add-name').value.trim();
    const icon = document.getElementById('add-icon').value;
    const category = document.getElementById('add-category').value;

    if (!path) {
      showNotification('请选择文件路径', 'error');
      return;
    }
    if (!name) {
      showNotification('请输入名称', 'error');
      return;
    }

    const success = await addShortcut({ path, name, icon, category });
    if (success) {
      hideModal('modal-add');
    }
  });

  // 添加分类
  document.getElementById('btn-add-category').addEventListener('click', () => {
    document.getElementById('add-category-name').value = '';
    showModal('modal-add-category');
  });

  document.getElementById('btn-cancel-add-category').addEventListener('click', () => {
    hideModal('modal-add-category');
  });

  document.getElementById('btn-confirm-add-category').addEventListener('click', async () => {
    const name = document.getElementById('add-category-name').value.trim();
    if (!name) {
      showNotification('请输入分类名称', 'error');
      return;
    }
    await addCategory(name);
    hideModal('modal-add-category');
  });

  // 设置面板
  document.getElementById('btn-settings').addEventListener('click', () => {
    // 更新设置面板状态
    document.getElementById('setting-autostart').checked = settings.autoStart || false;
    document.getElementById('setting-shortcut').value = settings.globalShortcut || 'CommandOrControl+Shift+Space';
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });
    showModal('settings-panel');
  });

  // 设置 - 主题
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.theme;
      settings.theme = theme;
      applyTheme(theme);
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await window.electronAPI.updateSettings({ theme });
    });
  });

  // 设置 - 开机自启
  document.getElementById('setting-autostart').addEventListener('change', async (e) => {
    settings.autoStart = e.target.checked;
    await window.electronAPI.updateSettings({ autoStart: e.target.checked });
    showNotification(e.target.checked ? '已启用开机自启' : '已关闭开机自启');
  });

  // 设置 - 全局快捷键
  document.getElementById('setting-shortcut').addEventListener('change', async (e) => {
    settings.globalShortcut = e.target.value;
    await window.electronAPI.updateSettings({ globalShortcut: e.target.value });
    showNotification('快捷键已更新');
  });

  // 设置 - 导出
  document.getElementById('btn-export').addEventListener('click', async () => {
    const result = await window.electronAPI.exportConfig();
    if (result.success) {
      showNotification('配置已导出');
    } else if (result.error !== '取消导出') {
      showNotification('导出失败: ' + result.error, 'error');
    }
  });

  // 设置 - 导入
  document.getElementById('btn-import').addEventListener('click', async () => {
    const result = await window.electronAPI.importConfig();
    if (result.success) {
      showNotification('配置已导入');
      // 重新加载数据
      shortcuts = await window.electronAPI.getShortcuts();
      categories = await window.electronAPI.getCategories();
      recentItems = await window.electronAPI.getRecent();
      renderCategoryTabs();
      renderRecent();
      renderShortcuts(getSearchFilter());
    } else if (result.error !== '取消导入') {
      showNotification('导入失败: ' + result.error, 'error');
    }
  });

  // 搜索
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('btn-clear-search');

  searchInput.addEventListener('input', () => {
    const value = searchInput.value;
    clearBtn.style.display = value ? 'block' : 'none';
    renderShortcuts(value);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    renderShortcuts();
    searchInput.focus();
  });

  // 右键菜单操作
  document.querySelectorAll('#context-menu .context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      if (!contextMenuTarget) return;

      const shortcut = contextMenuTarget;
      hideContextMenu();

      switch (action) {
        case 'launch':
          launchShortcut(shortcut.id);
          break;
        case 'edit':
          const newName = prompt('修改名称:', shortcut.name);
          if (newName && newName.trim()) {
            await updateShortcut(shortcut.id, { name: newName.trim() });
            showNotification('已更新');
          }
          break;
        case 'change-icon':
          const iconPath = await window.electronAPI.selectIcon();
          if (iconPath) {
            await updateShortcut(shortcut.id, { icon: iconPath });
            renderShortcuts(getSearchFilter());
            showNotification('图标已更换');
          }
          break;
        case 'move':
          const catNames = categories.map(c => c.name).join(', ');
          const targetCat = prompt(`移动到哪个分类？\n当前分类: ${catNames}`);
          if (targetCat) {
            const cat = categories.find(c => c.name === targetCat.trim());
            if (cat) {
              await updateShortcut(shortcut.id, { category: cat.id });
              renderShortcuts(getSearchFilter());
              showNotification(`已移动到 "${cat.name}"`);
            } else {
              showNotification('分类不存在', 'error');
            }
          }
          break;
        case 'delete':
          if (confirm(`确定删除 "${shortcut.name}" 吗？`)) {
            await deleteShortcut(shortcut.id);
          }
          break;
      }
    });
  });

  // 点击弹窗遮罩关闭
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', hideAllModals);
  });

  // 弹窗关闭按钮
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', hideAllModals);
  });

  // 点击其他区域关闭右键菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) {
      hideContextMenu();
    }
  });

  // ESC 关闭弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideAllModals();
    }
  });

  // 主题变化监听
  window.electronAPI.onThemeChanged((theme) => {
    applyTheme(theme);
    settings.theme = theme;
  });

  // 快捷键 - Ctrl+F 聚焦搜索
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);
