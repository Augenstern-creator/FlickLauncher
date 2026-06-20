// ========== 状态管理 ==========
let shortcuts = [];
let categories = [];
let settings = {};
let recentItems = [];
let currentCategory = 'all';
let contextMenuTarget = null;
let currentAddType = 'file'; // 'file' 或 'url'
let currentDataPath = '';
let pendingDataPath = ''; // 待迁移的路径
let selectedBuiltinIcon = ''; // 当前选中的内置图标路径
let editingShortcutId = null; // 当前正在编辑的快捷方式 ID
let deletingShortcutId = null; // 当前正在删除的快捷方式 ID
let currentAppVersion = ''; // 当前应用版本

// ========== 内置图标列表 ==========
const BUILTIN_ICONS = [
  { name: '浏览器', file: 'globe.svg' },
  { name: '邮件', file: 'mail.svg' },
  { name: '文件夹', file: 'folder.svg' },
  { name: '文件', file: 'file.svg' },
  { name: '代码', file: 'code.svg' },
  { name: '音乐', file: 'music.svg' },
  { name: '视频', file: 'video.svg' },
  { name: '图片', file: 'image.svg' },
  { name: '设置', file: 'gear.svg' },
  { name: '终端', file: 'terminal.svg' },
  { name: '游戏', file: 'game.svg' },
  { name: '聊天', file: 'chat.svg' },
  { name: '云', file: 'cloud.svg' },
  { name: '文档', file: 'document.svg' },
  { name: '日历', file: 'calendar.svg' },
  { name: '购物', file: 'shopping.svg' },
  { name: '工具', file: 'wrench.svg' },
  { name: '收藏', file: 'star.svg' }
];

// ========== 工具函数 ==========

function getSearchFilter() {
  return document.getElementById('search-input').value;
}

function setIconWithFallback(imgEl, src) {
  // URL 类型使用地球图标
  if (src === 'url') {
    imgEl.src = 'icons/default-icon.png';
    return;
  }
  imgEl.src = src || 'icons/default-icon.png';
  imgEl.onerror = () => { imgEl.src = 'icons/default-icon.png'; };
}

// ========== 初始化 ==========
async function init() {
  try {
    // 并行加载数据
    [shortcuts, categories, settings, recentItems, currentDataPath] = await Promise.all([
      window.electronAPI.getShortcuts(),
      window.electronAPI.getCategories(),
      window.electronAPI.getSettings(),
      window.electronAPI.getRecent(),
      window.electronAPI.getDataPath()
    ]);

    // 获取版本号
    currentAppVersion = await window.electronAPI.getAppVersion();

    // 应用主题
    applyTheme(settings.theme || 'dark');

    // 渲染界面
    renderCategoryTabs();
    renderRecent();
    renderShortcuts();

    // 绑定事件
    bindEvents();

    // 显示版本号
    const versionEl = document.getElementById('current-version');
    const aboutVersionEl = document.getElementById('about-version');
    if (versionEl) versionEl.textContent = `v${currentAppVersion}`;
    if (aboutVersionEl) aboutVersionEl.textContent = `v${currentAppVersion}`;

    // 监听更新状态
    window.electronAPI.onUpdateStatus(handleUpdateStatus);

    // 启动后显示更新日志（如果尚未看过当前版本）
    await showChangelogIfNeeded();

    console.log('Flick Launcher 已初始化');
    console.log('版本:', currentAppVersion);
    console.log('数据路径:', currentDataPath);
  } catch (e) {
    console.error('初始化失败:', e);
  }
}

// ========== 渲染函数 ==========

function renderBuiltinIconGrid() {
  const grid = document.getElementById('builtin-icon-grid');
  grid.innerHTML = '';

  for (const icon of BUILTIN_ICONS) {
    const item = document.createElement('div');
    item.className = 'builtin-icon-item';
    item.dataset.file = icon.file;
    item.title = icon.name;

    if (selectedBuiltinIcon === `icons/builtin/${icon.file}`) {
      item.classList.add('selected');
    }

    const img = document.createElement('img');
    img.src = `icons/builtin/${icon.file}`;
    img.draggable = false;

    const label = document.createElement('span');
    label.textContent = icon.name;

    item.appendChild(img);
    item.appendChild(label);

    item.addEventListener('click', () => {
      selectedBuiltinIcon = `icons/builtin/${icon.file}`;
      document.getElementById('add-icon').value = '';
      // 更新选中状态
      grid.querySelectorAll('.builtin-icon-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });

    grid.appendChild(item);
  }
}

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
    el.title = item.type === 'url' ? item.path : item.path;

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
  card.title = shortcut.type === 'url' ? shortcut.path : shortcut.path;

  const icon = document.createElement('img');
  icon.className = 'shortcut-icon';

  // URL 类型使用特殊图标
  if (shortcut.type === 'url') {
    icon.src = 'icons/default-icon.png';
  } else {
    setIconWithFallback(icon, shortcut.icon);
  }
  icon.draggable = false;

  const name = document.createElement('div');
  name.className = 'shortcut-name';
  name.textContent = shortcut.name;

  // URL 类型添加标记
  if (shortcut.type === 'url') {
    const urlBadge = document.createElement('span');
    urlBadge.className = 'url-badge';
    urlBadge.textContent = '🌐';
    name.appendChild(urlBadge);
  }

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
      showNotification(`启动失败：${result.error}`, 'error');
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
    showNotification(`已添加：${result.name}`);
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
    showNotification(`已创建分类：${name}`);
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

  // 关于作者
  document.getElementById('btn-author').addEventListener('click', () => {
    showModal('modal-about');
  });

  // 添加快捷方式
  document.getElementById('btn-add').addEventListener('click', () => {
    document.getElementById('add-path').value = '';
    document.getElementById('add-url').value = '';
    document.getElementById('add-name').value = '';
    document.getElementById('add-icon').value = '';

    // 重置为文件类型
    currentAddType = 'file';
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === 'file');
    });
    document.getElementById('file-path-group').style.display = 'block';
    document.getElementById('url-path-group').style.display = 'none';
    document.getElementById('icon-group').style.display = 'block';

    // 重置内置图标选择
    selectedBuiltinIcon = '';
    renderBuiltinIconGrid();

    // 更新分类下拉
    const select = document.getElementById('add-category');
    select.innerHTML = categories.map(c =>
      `<option value="${c.id}">${c.name}</option>`
    ).join('');
    showModal('modal-add');
  });

  // 类型切换（文件/URL）
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentAddType = btn.dataset.type;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (currentAddType === 'file') {
        document.getElementById('file-path-group').style.display = 'block';
        document.getElementById('url-path-group').style.display = 'none';
        document.getElementById('icon-group').style.display = 'block';
        // 默认分类为常用文件夹
        document.getElementById('add-category').value = 'folders';
      } else {
        document.getElementById('file-path-group').style.display = 'none';
        document.getElementById('url-path-group').style.display = 'block';
        document.getElementById('icon-group').style.display = 'none';
        // 默认分类为常用网页
        document.getElementById('add-category').value = 'web';
      }
    });
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

  document.getElementById('btn-browse-folder').addEventListener('click', async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      document.getElementById('add-path').value = folderPath;
      // 自动填充名称（取文件夹名）
      const info = await window.electronAPI.getFileInfo(folderPath);
      if (info) {
        document.getElementById('add-name').value = info.name;
      }
    }
  });

  document.getElementById('btn-browse-icon').addEventListener('click', async () => {
    const iconPath = await window.electronAPI.selectIcon();
    if (iconPath) {
      document.getElementById('add-icon').value = iconPath;
      // 清除内置图标选择
      selectedBuiltinIcon = '';
      document.querySelectorAll('.builtin-icon-item').forEach(el => el.classList.remove('selected'));
    }
  });

  document.getElementById('btn-cancel-add').addEventListener('click', () => {
    hideModal('modal-add');
  });

  document.getElementById('btn-confirm-add').addEventListener('click', async () => {
    let pathValue = '';
    let name = document.getElementById('add-name').value.trim();
    const customIcon = document.getElementById('add-icon').value;
    const icon = customIcon || selectedBuiltinIcon;
    const category = document.getElementById('add-category').value;

    if (currentAddType === 'file') {
      pathValue = document.getElementById('add-path').value;
      if (!pathValue) {
        showNotification('请选择文件路径', 'error');
        return;
      }
      if (!name) {
        showNotification('请输入名称', 'error');
        return;
      }
      const success = await addShortcut({ path: pathValue, type: 'file', name, icon, category });
      if (success) {
        hideModal('modal-add');
      }
    } else {
      pathValue = document.getElementById('add-url').value.trim();
      if (!pathValue) {
        showNotification('请输入网页 URL', 'error');
        return;
      }
      // 验证 URL 格式
      if (!/^https?:\/\//i.test(pathValue)) {
        showNotification('URL 格式不正确，请以 http:// 或 https:// 开头', 'error');
        return;
      }
      if (!name) {
        // 自动从 URL 提取名称
        try {
          const url = new URL(pathValue);
          name = url.hostname.replace('www.', '');
        } catch (e) {
          name = pathValue;
        }
      }
      const success = await addShortcut({ path: pathValue, type: 'url', name, category });
      if (success) {
        hideModal('modal-add');
      }
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
  document.getElementById('btn-settings').addEventListener('click', async () => {
    // 更新设置面板状态
    document.getElementById('setting-autostart').checked = settings.autoStart || false;
    document.getElementById('setting-shortcut').value = settings.globalShortcut || 'CommandOrControl+Shift+Space';
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });

    // 更新数据路径显示
    document.getElementById('current-data-path').textContent = currentDataPath;
    pendingDataPath = '';

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

  // 设置 - 更改数据路径
  document.getElementById('btn-change-data-path').addEventListener('click', async () => {
    const newPath = await window.electronAPI.selectDataFolder();
    if (newPath) {
      pendingDataPath = newPath;
      document.getElementById('current-data-path').textContent = newPath + '（待迁移）';
      showNotification('已选择新路径，点击"迁移数据"完成迁移');
    }
  });

  // 设置 - 迁移数据
  document.getElementById('btn-migrate-data').addEventListener('click', async () => {
    if (!pendingDataPath) {
      showNotification('请先选择新的数据路径', 'error');
      return;
    }

    if (confirm(`确定将数据迁移到以下路径吗？\n${pendingDataPath}\n\n迁移完成后应用将使用新路径存储数据。`)) {
      const result = await window.electronAPI.migrateData(pendingDataPath);
      if (result.success) {
        currentDataPath = pendingDataPath;
        pendingDataPath = '';
        document.getElementById('current-data-path').textContent = currentDataPath;
        showNotification('数据迁移成功！');

        // 更新设置中的路径
        settings.dataPath = currentDataPath;
        await window.electronAPI.updateSettings({ dataPath: currentDataPath });
      } else {
        showNotification('迁移失败：' + result.error, 'error');
      }
    }
  });

  // 设置 - 导出
  document.getElementById('btn-export').addEventListener('click', async () => {
    const result = await window.electronAPI.exportConfig();
    if (result.success) {
      showNotification('配置已导出');
    } else if (result.error !== '取消导出') {
      showNotification('导出失败：' + result.error, 'error');
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
      showNotification('导入失败：' + result.error, 'error');
    }
  });

  // 设置 - 检查更新
  document.getElementById('btn-check-update').addEventListener('click', async () => {
    showModal('modal-update');
    document.getElementById('update-status-content').innerHTML = '<div class="update-status-icon checking">🔍</div><p>正在检查更新...</p>';
    document.getElementById('update-footer').innerHTML = '<button class="btn btn-secondary" onclick="hideModal(\'modal-update\')">取消</button>';
    const result = await window.electronAPI.checkForUpdates();
    if (!result.success) {
      // 如果 IPC 调用失败，显示错误信息
      document.getElementById('update-status-content').innerHTML = `<div class="update-status-icon error">❌</div><p>更新失败：${result.error || '未知错误'}</p>`;
      document.getElementById('update-footer').innerHTML = '<button class="btn btn-primary" onclick="hideModal(\'modal-update\')">关闭</button>';
    }
  });

  // 设置 - 查看更新日志
  document.getElementById('btn-view-changelog').addEventListener('click', async () => {
    const changelog = await window.electronAPI.getChangelog();
    if (changelog && changelog.length > 0) {
      document.getElementById('changelog-body').innerHTML = renderChangelogContent(changelog);
      showModal('modal-changelog');
    } else {
      showNotification('暂无更新日志', 'error');
    }
  });

  // 更新日志弹窗 - 关闭
  document.getElementById('btn-close-changelog').addEventListener('click', () => {
    hideModal('modal-changelog');
  });

  // 关于作者弹窗 - 链接点击
  document.querySelectorAll('.about-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = link.getAttribute('href');
      if (url) {
        await window.electronAPI.openExternal(url);
      }
    });
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
          // 打开编辑弹窗
          editingShortcutId = shortcut.id;
          document.getElementById('edit-name').value = shortcut.name;
          const editSelect = document.getElementById('edit-category');
          editSelect.innerHTML = categories.map(c =>
            `<option value="${c.id}"${c.id === shortcut.category ? ' selected' : ''}>${c.name}</option>`
          ).join('');
          showModal('modal-edit');
          break;
        case 'change-icon':
          if (shortcut.type === 'url') {
            showNotification('URL 类型不支持更换图标', 'error');
            return;
          }
          const iconPath = await window.electronAPI.selectIcon();
          if (iconPath) {
            await updateShortcut(shortcut.id, { icon: iconPath });
            renderShortcuts(getSearchFilter());
            showNotification('图标已更换');
          }
          break;
        case 'move':
          // 打开编辑弹窗（只改分类）
          editingShortcutId = shortcut.id;
          document.getElementById('edit-name').value = shortcut.name;
          const moveSelect = document.getElementById('edit-category');
          moveSelect.innerHTML = categories.map(c =>
            `<option value="${c.id}"${c.id === shortcut.category ? ' selected' : ''}>${c.name}</option>`
          ).join('');
          showModal('modal-edit');
          break;
        case 'delete':
          // 打开删除确认弹窗
          deletingShortcutId = shortcut.id;
          document.getElementById('delete-confirm-text').textContent = `确定要删除「${shortcut.name}」吗？`;
          showModal('modal-confirm-delete');
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

  // 编辑弹窗 - 取消
  document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    hideModal('modal-edit');
    editingShortcutId = null;
  });

  // 编辑弹窗 - 确认保存
  document.getElementById('btn-confirm-edit').addEventListener('click', async () => {
    if (!editingShortcutId) return;
    const newName = document.getElementById('edit-name').value.trim();
    const newCategory = document.getElementById('edit-category').value;
    if (!newName) {
      showNotification('名称不能为空', 'error');
      return;
    }
    await updateShortcut(editingShortcutId, { name: newName, category: newCategory });
    renderShortcuts(getSearchFilter());
    showNotification('已更新');
    hideModal('modal-edit');
    editingShortcutId = null;
  });

  // 删除确认弹窗 - 取消
  document.getElementById('btn-cancel-delete').addEventListener('click', () => {
    hideModal('modal-confirm-delete');
    deletingShortcutId = null;
  });

  // 删除确认弹窗 - 确认删除
  document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    if (!deletingShortcutId) return;
    await deleteShortcut(deletingShortcutId);
    hideModal('modal-confirm-delete');
    deletingShortcutId = null;
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

  // 窗口状态变化监听（最大化/还原切换图标）
  window.electronAPI.onWindowStateChanged((state) => {
    const maximizeBtn = document.getElementById('btn-maximize');
    const iconMaximize = maximizeBtn.querySelector('.icon-maximize');
    const iconRestore = maximizeBtn.querySelector('.icon-restore');
    if (state === 'maximized') {
      iconMaximize.style.display = 'none';
      iconRestore.style.display = 'block';
      maximizeBtn.title = '还原';
    } else {
      iconMaximize.style.display = 'block';
      iconRestore.style.display = 'none';
      maximizeBtn.title = '最大化';
    }
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

// ========== 更新日志 ==========

async function showChangelogIfNeeded() {
  try {
    const changelog = await window.electronAPI.getChangelog();
    if (!changelog || changelog.length === 0) return;

    const lastSeen = settings.lastSeenChangelog || '';
    const latestVersion = changelog[0].version;

    // 如果已经看过最新版本，不显示
    if (lastSeen === latestVersion) return;

    // 渲染更新日志
    const body = document.getElementById('changelog-body');
    body.innerHTML = renderChangelogContent(changelog);

    showModal('modal-changelog');

    // 记录已查看的版本
    settings.lastSeenChangelog = latestVersion;
    await window.electronAPI.updateSettings({ lastSeenChangelog: latestVersion });
  } catch (e) {
    console.error('显示更新日志失败:', e);
  }
}

function renderChangelogContent(changelog) {
  return changelog.map(entry => {
    const dateStr = entry.date ? new Date(entry.date).toLocaleDateString('zh-CN') : '';
    const changes = entry.changes.map(c => `<li>${c}</li>`).join('');
    return `
      <div class="changelog-entry">
        <div class="changelog-version">
          <span class="changelog-ver-num">v${entry.version}</span>
          ${dateStr ? `<span class="changelog-date">${dateStr}</span>` : ''}
        </div>
        <ul class="changelog-list">${changes}</ul>
      </div>
    `;
  }).join('');
}

// ========== 自动更新 ==========

function handleUpdateStatus(data) {
  const statusContent = document.getElementById('update-status-content');
  const footer = document.getElementById('update-footer');

  switch (data.status) {
    case 'checking':
      statusContent.innerHTML = '<div class="update-status-icon checking">🔍</div><p>正在检查更新...</p>';
      footer.innerHTML = '<button class="btn btn-secondary" onclick="hideModal(\'modal-update\')">取消</button>';
      break;
    case 'available':
      statusContent.innerHTML = `
        <div class="update-status-icon available">✅</div>
        <p>发现新版本 <strong>v${data.version}</strong></p>
        <p class="update-date">${data.releaseDate ? new Date(data.releaseDate).toLocaleDateString('zh-CN') : ''}</p>
      `;
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="hideModal('modal-update')">暂不更新</button>
        <button class="btn btn-primary" onclick="downloadUpdate()">立即下载</button>
      `;
      if (!document.getElementById('modal-update').style.display || document.getElementById('modal-update').style.display === 'none') {
        showModal('modal-update');
      }
      break;
    case 'up-to-date':
      statusContent.innerHTML = '<div class="update-status-icon uptodate">🎉</div><p>当前已是最新版本</p>';
      footer.innerHTML = '<button class="btn btn-primary" onclick="hideModal(\'modal-update\')">好的</button>';
      if (!document.getElementById('modal-update').style.display || document.getElementById('modal-update').style.display === 'none') {
        showModal('modal-update');
      }
      break;
    case 'downloading':
      const percent = Math.round(data.percent);
      statusContent.innerHTML = `
        <div class="update-status-icon downloading">⬇️</div>
        <p>正在下载更新... ${percent}%</p>
        <div class="update-progress-bar"><div class="update-progress-fill" style="width:${percent}%"></div></div>
      `;
      footer.innerHTML = '<button class="btn btn-secondary" disabled>下载中...</button>';
      break;
    case 'downloaded':
      statusContent.innerHTML = '<div class="update-status-icon downloaded">✅</div><p>下载完成，重启以安装更新</p>';
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="hideModal('modal-update')">稍后重启</button>
        <button class="btn btn-primary" onclick="installUpdate()">立即重启</button>
      `;
      break;
    case 'error':
      statusContent.innerHTML = `<div class="update-status-icon error">❌</div><p>更新失败：${data.message}</p>`;
      footer.innerHTML = '<button class="btn btn-primary" onclick="hideModal(\'modal-update\')">关闭</button>';
      break;
  }
}

async function checkForUpdatesSilent() {
  try {
    await window.electronAPI.checkForUpdates();
  } catch (e) {
    console.error('检查更新失败:', e);
  }
}

async function downloadUpdate() {
  try {
    await window.electronAPI.downloadUpdate();
  } catch (e) {
    showNotification('下载失败: ' + e.message, 'error');
  }
}

function installUpdate() {
  window.electronAPI.installUpdate();
}

// 暴露给全局使用
window.hideModal = hideModal;
window.downloadUpdate = downloadUpdate;
window.installUpdate = installUpdate;

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);
