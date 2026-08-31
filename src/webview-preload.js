/**
 * webview guest preload：在页面上下文监听 Esc，决定是否通知宿主退出面板全屏。
 *
 * 为什么不在主进程 before-input-event 里直接转发：
 * 站点可能自己消费 Esc（如小红书打开帖子详情弹层后按 Esc 关闭弹层），
 * 主进程层面无法感知页面状态，直接转发会导致"弹层关闭 + 面板退出"同时发生。
 * 因此在页面上下文捕获阶段先快照弹层/焦点状态，事件分发完后再判定。
 */

const { ipcRenderer } = require('electron');

// 屏蔽站点的 Badging API（Kimi 等站会把未读数写到 macOS Dock 角标）。
// 注意：contextIsolation 下 preload 运行在隔离世界，这里的补丁对页面主世界
// 【无效】，真正生效的在 renderer.js dom-ready 时经 executeJavaScript 注入主世界；
// 这里保留仅作双保险。
for (const name of ['setAppBadge', 'clearAppBadge']) {
  if (name in Navigator.prototype) {
    Object.defineProperty(Navigator.prototype, name, {
      value: () => Promise.resolve(),
      writable: false,
      configurable: false,
    });
  }
}

// 各站点"弹层打开"的特征选择器（按 host 后缀匹配，命中其一即视为站点有弹层）。
// 小红书帖子详情弹层的遮罩与左上角关闭按钮。
const MODAL_SELECTORS_BY_HOST = {
  'xiaohongshu.com': ['.note-detail-mask', '.close-circle'],
  'xhslink.com': ['.note-detail-mask', '.close-circle'],
};

// 通用弹层特征：标准 dialog 语义标记
const GENERIC_MODAL_SELECTORS = ['[role="dialog"]', '[aria-modal="true"]', 'dialog[open]'];

/** 元素实际可见才算数（不少站点弹层节点常驻 DOM、仅靠显隐切换） */
function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight);
}

/** 当前页面是否有打开中的弹层 */
function hasOpenModal() {
  const host = location.hostname.replace(/^www\./, '');
  const hostKey = Object.keys(MODAL_SELECTORS_BY_HOST)
    .find((h) => host === h || host.endsWith('.' + h));
  const selectors = hostKey
    ? [...GENERIC_MODAL_SELECTORS, ...MODAL_SELECTORS_BY_HOST[hostKey]]
    : GENERIC_MODAL_SELECTORS;

  return selectors.some((sel) => {
    try {
      return Array.from(document.querySelectorAll(sel)).some(isVisible);
    } catch {
      return false; // 非法选择器等异常静默忽略
    }
  });
}

/** 焦点在可编辑元素且有实际内容/选区（Esc 需先清除输入内容） */
function editableHasContent() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.isContentEditable) {
    const sel = window.getSelection();
    return (el.textContent?.trim().length > 0) || (sel && sel.type === 'Range');
  }
  if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) {
    return el.selectionStart !== el.selectionEnd || (el.value?.length > 0);
  }
  return false;
}

// 捕获阶段监听：先于站点自身的 keydown 处理拿到事件，
// 此刻快照弹层/焦点状态；等本次事件全部分发完（setTimeout 0）再统一判定。
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey) return;

  const modalWasOpen = hasOpenModal();
  const editing = editableHasContent();

  setTimeout(() => {
    // 只有「可见弹层开着」或「输入框有内容/选区需 Esc 先清除」时归站点；
    // 其余一律上报宿主收起面板全屏。
    // 不用 defaultPrevented：站点（如豆包）会预防性 preventDefault，
    // 并不代表它有意消费 Esc。
    if (modalWasOpen || editing) return;
    ipcRenderer.sendToHost('webview-escape');
  }, 0);
}, true);
