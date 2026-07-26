/**
 * 3for Reader - 多标签文章阅读器
 *
 * 接收主进程转发的外部链接，以标签页形式打开。
 * 每个标签对应一个 webview，支持复制链接、默认浏览器打开、页面内查找。
 */

const tabsContainer = document.getElementById('reader-tabs');
const contentContainer = document.getElementById('reader-content');
const emptyEl = document.getElementById('reader-empty');
const copyBtn = document.getElementById('btn-copy-link');
const openExternalBtn = document.getElementById('btn-open-external');
const searchInput = document.getElementById('reader-search-input');
const searchCount = document.getElementById('reader-search-count');

let tabs = [];
let activeTabId = null;
let tabCounter = 0;

/** 创建并激活一个新标签页 */
function addTab(url) {
  const id = `reader-tab-${++tabCounter}`;
  const tab = { id, url, title: url, webview: null };
  tabs.push(tab);

  // 标签按钮
  const tabEl = document.createElement('div');
  tabEl.className = 'reader-tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `
    <span class="tab-title"></span>
    <span class="tab-close" data-close-id="${id}">&times;</span>
  `;
  tabEl.querySelector('.tab-title').textContent = url;
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.tab-close')) {
      closeTab(id);
    } else {
      setActiveTab(id);
    }
  });
  tabsContainer.appendChild(tabEl);

  // webview
  const wv = document.createElement('webview');
  wv.id = id;
  wv.className = 'reader-webview';
  wv.src = url;
  wv.setAttribute('partition', 'persist:reader');
  wv.setAttribute('allowpopups', '');
  contentContainer.appendChild(wv);
  tab.webview = wv;

  // 标题更新
  wv.addEventListener('page-title-updated', (e) => {
    tab.title = e.title || tab.title;
    const titleEl = tabEl.querySelector('.tab-title');
    if (titleEl) titleEl.textContent = tab.title;
  });

  // 导航后同步标签记录的 URL，确保复制链接、浏览器打开使用当前地址
  wv.addEventListener('did-navigate', (e) => {
    if (e.url && e.url.startsWith('http')) {
      tab.url = e.url;
    }
  });

  // 查找结果计数
  wv.addEventListener('found-in-page', (e) => {
    if (e.result) {
      const { activeMatchOrdinal, matches } = e.result;
      searchCount.textContent = matches > 0 ? `${activeMatchOrdinal}/${matches}` : '0/0';
    }
  });

  setActiveTab(id);
  updateEmptyState();
}

/** 切换当前激活标签 */
function setActiveTab(id) {
  activeTabId = id;

  tabs.forEach((t) => {
    const tabEl = tabsContainer.querySelector(`.reader-tab[data-id="${t.id}"]`);
    if (tabEl) tabEl.classList.toggle('active', t.id === id);
    if (t.webview) t.webview.classList.toggle('active', t.id === id);
  });
}

/** 关闭指定标签 */
function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];
  if (tab.webview) tab.webview.remove();

  const tabEl = tabsContainer.querySelector(`.reader-tab[data-id="${id}"]`);
  if (tabEl) tabEl.remove();

  tabs.splice(idx, 1);

  if (activeTabId === id) {
    const next = tabs[tabs.length - 1];
    activeTabId = next ? next.id : null;
  }

  if (activeTabId) setActiveTab(activeTabId);
  updateEmptyState();
}

/** 根据当前是否有标签显示/隐藏空状态 */
function updateEmptyState() {
  emptyEl.style.display = tabs.length === 0 ? 'flex' : 'none';
}

/** 获取当前激活的标签对象 */
function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

// 复制链接
copyBtn.addEventListener('click', async () => {
  const tab = getActiveTab();
  if (!tab) return;
  await window.electronAPI.copyText(tab.url);
  showToast('链接已复制');
});

/** 显示一个临时 toast 提示 */
function showToast(message) {
  let toast = document.querySelector('.reader-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'reader-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 1500);
}

// 默认浏览器打开
openExternalBtn.addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab) window.electronAPI.openExternal(tab.url);
});

// 查找
searchInput.addEventListener('keydown', (e) => {
  const tab = getActiveTab();
  if (!tab || !tab.webview) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    const text = searchInput.value.trim();
    if (!text) return;

    const isSameText = tab.lastSearchText === text;
    tab.lastSearchText = text;
    tab.webview.findInPage(text, {
      forward: true,
      findNext: isSameText,
    });
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    tab.webview.stopFindInPage('clearSelection');
    searchCount.textContent = '';
    searchInput.blur();
  }
});

// Cmd/Ctrl + F 聚焦搜索框
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// 监听主进程转发的新标签请求
window.electronAPI.onReaderAddTab((url) => {
  if (url && url.startsWith('http')) {
    addTab(url);
  }
});

// webview 聚焦时，Ctrl/Cmd+F 由主进程转发到这里
window.electronAPI.onReaderFocusFind(() => {
  searchInput.focus();
  searchInput.select();
});
