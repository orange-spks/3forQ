/**
 * 3for - Renderer Script
 *
 * Core search logic runs directly in the renderer process.
 * - webview.executeJavaScript() injects auto-fill scripts into each source page
 * - Top search bar: broadcasts query to ALL webviews
 * - Individual webview search: stays within that webview only
 *
 * Summary feature:
 * - Extracts content from webviews via executeJavaScript()
 * - Sends to main process via IPC for DeepSeek summarization
 * - Renders conclusion + per-source highlights
 *
 * Configurable sources:
 * - 7 available sources (ChatGPT, Doubao, Xiaohongshu, Kimi, Metaso, Bing, Gemini, Grok)
 * - 4 active panels, swappable via source picker modal
 *
 * Fullscreen:
 * - Each panel can be expanded to fill the entire grid area
 *
 * Panel-level zoom:
 * - Ctrl/Cmd + Plus/Minus/0 zooms the hovered/focused webview panel,
 *   falling back to all webviews when no panel is targeted
 */

// ─── DOM References ─────────────────────────────────────────
const mainSearch = document.getElementById('main-search');
const panelsGrid = document.getElementById('panels-grid');
const reloadAllBtn = document.getElementById('btn-reload-all');

// ─── Source Configuration ───────────────────────────────────
// All available information sources with their metadata.
const ALL_SOURCES = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    color: '#10a37f',
    logo: '../logo/chatgpt.png',
    type: 'LLM',
    uniqueValue: '通用推理、逻辑分析、复杂问题深度拆解',
  },
  doubao: {
    name: 'Doubao',
    url: 'https://www.doubao.com/chat/',
    color: '#5b5bff',
    logo: '../logo/doubao.png',
    type: 'LLM',
    uniqueValue: '响应最快、中文优化、关联视频教程',
  },
  xiaohongshu: {
    name: 'Xiaohongshu',
    url: 'https://www.xiaohongshu.com/explore',
    color: '#ff2442',
    logo: '../logo/xhs.png',
    type: '社区',
    uniqueValue: '真实用户体验、种草避坑、生活决策参考',
  },
  kimi: {
    name: 'Kimi',
    url: 'https://kimi.moonshot.cn',
    color: '#6366f1',
    logo: '../logo/kimi.png',
    type: 'LLM/搜索',
    uniqueValue: '长文本处理、深度分析、研究导向',
  },
  metaso: {
    name: 'Metaso',
    url: 'https://metaso.cn',
    color: '#00b8a9',
    logo: '../logo/mita.webp',
    type: 'AI搜索',
    uniqueValue: '学术搜索、知识图谱、结构化知识检索',
  },
  bing: {
    name: 'Bing',
    url: 'https://www.bing.com',
    color: '#008373',
    logo: '../logo/bing.png',
    type: '搜索引擎',
    uniqueValue: '广泛网页覆盖、实时新闻资讯、多语言结果',
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com/app',
    color: '#4285f4',
    logo: '../logo/gemini.png',
    type: 'LLM',
    uniqueValue: 'Google 多模态 AI、实时联网搜索、长上下文理解',
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.com',
    color: '#000000',
    logo: '../logo/grok.png',
    type: 'LLM',
    uniqueValue: 'xAI 实时搜索、长推理、少过滤响应',
  },
};

// Currently active sources (displayed in the 4 panels).
let activeSources = ['chatgpt', 'doubao', 'xiaohongshu', 'kimi'];

// Track which panel is requesting a source swap.
let swapPanelIndex = -1;

/** Get the config for a source ID. */
function getSourceConfig(id) {
  return ALL_SOURCES[id] || { name: id, url: '', color: '#888', type: '', uniqueValue: '' };
}

/** Query all current webview elements (dynamic, always fresh). */
function getWebviews() {
  return document.querySelectorAll('webview');
}

/** 判断某个源是否为 LLM 类型（包含 'LLM' 字样） */
function isLLMSource(sourceId) {
  return (getSourceConfig(sourceId).type || '').includes('LLM');
}

/** 各 LLM 源新建对话的动作配置：快捷键或 DOM 点击 */
const NEW_CHAT_ACTIONS = {
  chatgpt: { method: 'shortcut', key: 'O', modifiers: ['shift', 'ctrlOrCmd'] },
  kimi:    { method: 'shortcut', key: 'K', modifiers: ['ctrlOrCmd'] },
  doubao:  { method: 'shortcut', key: 'K', modifiers: ['shift', 'ctrlOrCmd'] },
  gemini:  { method: 'dom', selectorText: /new chat/i, fallbackUrl: 'https://gemini.google.com/app' },
  grok:    { method: 'dom', selectorText: /new chat/i, fallbackUrl: 'https://grok.com' },
};

/** 将配置中的 ctrl/ctrlOrCmd 映射为 Electron 可识别的 modifier */
function buildElectronModifiers(modifiers) {
  const isMac = window.appInfo?.platform === 'darwin';
  return modifiers.map((m) => {
    if (m === 'ctrlOrCmd') return isMac ? 'command' : 'control';
    if (m === 'ctrl') return 'control';
    return m;
  });
}

/** 为单个 webview 触发新建对话 */
async function triggerNewChat(webview) {
  const sourceId = webview.id;
  const action = NEW_CHAT_ACTIONS[sourceId];
  if (!action) return;

  try {
    if (action.method === 'shortcut') {
      webview.focus();
      const mods = buildElectronModifiers(action.modifiers);
      webview.sendInputEvent({ type: 'keyDown', keyCode: action.key, modifiers: mods });
      webview.sendInputEvent({ type: 'keyUp', keyCode: action.key, modifiers: mods });
    } else if (action.method === 'dom') {
      const selectorRegexStr = action.selectorText.toString();
      const clicked = await webview.executeJavaScript(`
        (() => {
          const regex = ${selectorRegexStr};
          const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
          const btn = buttons.find((b) => regex.test((b.textContent || b.innerText || '').trim()));
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        })()
      `);
      if (!clicked && action.fallbackUrl) {
        webview.loadURL(action.fallbackUrl);
      }
    }
  } catch (err) {
    console.warn('[3for] 新建对话失败:', sourceId, err.message);
  }
}

// ─── Auto-fill Script ───────────────────────────────────────
// This script is injected into each webview via executeJavaScript().
// It runs in the context of the embedded website.
function buildFillScript(query, { preferBottom = false, sourceId = null } = {}) {
  return `(() => {
    try {
      const query = ${JSON.stringify(query)};
      const preferBottom = ${preferBottom};
      const sourceId = ${JSON.stringify(sourceId)};

      /* ── Utility: set value in a React/framework-compatible way ── */
    function setNativeValue(el, value) {
      try {
        const proto = el.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, value);
          return;
        }
      } catch (e) { /* fallback below */ }
      el.value = value;
    }

    /* ── Utility: safely dispatch an event if the constructor exists ── */
    function safeDispatch(el, EventCtor, type, opts = {}) {
      try {
        if (typeof EventCtor === 'function') {
          el.dispatchEvent(new EventCtor(type, opts));
        }
      } catch (e) { /* ignore */ }
    }

    /* ── Utility: fill any input-like element ── */
    function fillInput(el, text) {
      try { el.focus(); } catch (e) { /* ignore */ }

      if (el.getAttribute('contenteditable') === 'true'
          || el.getAttribute('role') === 'textbox') {
        // Contenteditable: set textContent and dispatch input event
        el.textContent = text;
        safeDispatch(el, Event, 'input', { bubbles: true });
        safeDispatch(el, Event, 'change', { bubbles: true });
      } else {
        // Standard input/textarea: use native setter for React compat
        setNativeValue(el, text);
        safeDispatch(el, Event, 'input', { bubbles: true });
        safeDispatch(el, Event, 'change', { bubbles: true });
      }

      // Additional: simulate character-level input for frameworks
      // that listen to compositionend or beforeinput events
      safeDispatch(el, Event, 'compositionend', { bubbles: true });
      safeDispatch(el, InputEvent, 'beforeinput', {
        bubbles: true, cancelable: true, inputType: 'insertText', data: text,
      });
    }

    /* ── Utility: try to submit via send button, fallback to Enter ── */
    function trySubmit(inputEl) {
      const btnSelectors = [
        'button[data-testid="send-button"]',
        'button[data-testid="fruitjuice-send-button"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'button[aria-label*="提交"]',
        'button[aria-label*="Submit"]',
        'button[aria-label*="搜索"]',
        'button[aria-label*="search" i]',
        'button[aria-label*="send" i]',
        'button[class*="send" i]',
        'button[class*="submit" i]',
        'button[class*="search" i]',
        'button[class*="Send" i]',
        'button[class*="search-btn" i]',
        'button[type="submit"]',
        // Icon buttons near the input (common pattern for AI chat sites)
        'button svg[class*="send" i]',
        'button svg[class*="arrow" i]',
      ];

      for (const sel of btnSelectors) {
        try {
          const btn = document.querySelector(sel);
          if (btn) {
            // For svg-inside-button pattern, click the parent button
            const clickTarget = btn.closest('button') || btn;
            if (!clickTarget.disabled && clickTarget.offsetParent !== null) {
              clickTarget.click();
              return true;
            }
          }
        } catch (e) { /* continue */ }
      }

      // Also try: find any visible button near the input element
      if (inputEl) {
        const parent = inputEl.closest('form') || inputEl.parentElement;
        if (parent) {
          const nearbyBtns = parent.querySelectorAll('button');
          for (const btn of nearbyBtns) {
            if (!btn.disabled && btn.offsetParent !== null) {
              // Only click if it looks like a send/submit button
              const text = (btn.textContent || '').trim().toLowerCase();
              const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
              if (text.includes('send') || text.includes('发送') || text.includes('搜索') ||
                  text.includes('submit') || text.includes('搜') ||
                  ariaLabel.includes('send') || ariaLabel.includes('发送') ||
                  ariaLabel.includes('search') || ariaLabel.includes('搜索') ||
                  btn.querySelector('svg') /* icon-only button near input */) {
                btn.click();
                return true;
              }
            }
          }
        }
      }

      // Fallback: dispatch Enter keydown on the input
      if (inputEl) {
        inputEl.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13,
          which: 13, bubbles: true, cancelable: true,
        }));
        // Also dispatch keyup for completeness
        setTimeout(() => {
          inputEl.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter', code: 'Enter', keyCode: 13,
            which: 13, bubbles: true, cancelable: true,
          }));
        }, 50);
      }
      return false;
    }

    /* ── Step 0: Source-specific selector fallback ── */
    // 对 Grok 等已知结构的源，优先用特征选择器命中真正的 prompt 输入框，
    // 避免被顶部/侧边的“搜索已有对话”框干扰。
    let input = null;

    if (sourceId === 'grok') {
      const grokSelectors = [
        'textarea[placeholder*="你想知道什么"]',
        'textarea[aria-label*="向 Grok 提任何问题"]',
        'textarea[placeholder*="Ask anything"]',
        'textarea[aria-label*="Ask Grok anything"]',
      ];
      for (const sel of grokSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 0) {
              input = el;
              break;
            }
          }
        } catch (e) { /* continue */ }
      }
    }

    // 小红书：首页搜索区域由多个叠加的 textarea.textarea 组成，
    // 一个 placeholder 是"搜索小红书"，另一个是动态推荐词。
    // 先确定主输入框，后续统一填充并提交。
    let xhsInputs = [];
    if (sourceId === 'xiaohongshu' && !input) {
      xhsInputs = Array.from(document.querySelectorAll('textarea.textarea'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 100 && rect.height > 0 && el.offsetParent !== null;
        });

      if (xhsInputs.length > 0) {
        // 优先用 placeholder 不是"搜索小红书"的动态推荐 textarea 作为主输入框
        input = xhsInputs.find((el) => el.getAttribute('placeholder') !== '搜索小红书') || xhsInputs[0];
      }
    }

    /* ── Step 1: Find the search/prompt input element ── */
    // LLM 源的聊天输入通常是 textarea/contenteditable；把 input[type="text"] 置后，
    // 避免 Grok 顶部“搜索已有对话”的普通输入框被优先命中。
    const SELECTORS = preferBottom
      ? [
          'textarea',
          '[contenteditable="true"]',
          'div[role="textbox"]',
          'input[type="text"]',
          'input:not([type])',
        ]
      : [
          // 非 LLM 源（搜索/社区）的搜索框通常是 <input>，优先匹配 input，
          // 避免把评论、发布等 textarea / contenteditable 区域误当成搜索框。
          'input[type="search"]',
          'input[type="text"]',
          'input:not([type])',
          'textarea',
          '[contenteditable="true"]',
          'div[role="textbox"]',
        ];

    function isSearchLike(el) {
      const hint = (
        (el.getAttribute('placeholder') || '') + ' ' +
        (el.getAttribute('aria-label') || '') + ' ' +
        (el.textContent || '').trim().slice(0, 80)
      ).toLowerCase();
      return /search|搜索|查找/.test(hint);
    }

    const viewportHeight = window.innerHeight;
    const candidates = [];

    for (const sel of SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 0 && el.offsetParent !== null) {
          candidates.push({ el, rect });
        }
      }
    }

    // LLM 源：排除搜索框后，优先在页面中下部分选最靠下的输入框。
    // 阈值用 0.33 而非 0.5，避免 Grok 等将 prompt 放在页面中部的布局被漏掉。
    if (preferBottom && candidates.length > 0) {
      const chatCandidates = candidates.filter((c) => !isSearchLike(c.el));
      const lowerCandidates = chatCandidates.filter((c) => c.rect.top >= viewportHeight * 0.33);
      const pool = lowerCandidates.length > 0 ? lowerCandidates : chatCandidates;
      if (pool.length > 0) {
        input = pool.reduce((best, cur) =>
          cur.rect.bottom > best.rect.bottom ? cur : best
        ).el;
      }
    }

    // 非 LLM 源：使用第一个可见输入框（通常是顶部搜索框）
    if (!input && candidates.length > 0 && !preferBottom) {
      input = candidates[0].el;
    }

    // LLM 源兜底：仍没找到时，在所有可见输入里选最靠下的
    if (!input && candidates.length > 0 && preferBottom) {
      input = candidates.reduce((best, cur) =>
        cur.rect.bottom > best.rect.bottom ? cur : best
      ).el;
    }

    // 放宽宽度限制再试一次
    if (!input) {
      const looseCandidates = [];
      for (const sel of SELECTORS) {
        for (const el of document.querySelectorAll(sel)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 0 && el.offsetParent !== null) {
            looseCandidates.push({ el, rect });
          }
        }
      }
      if (looseCandidates.length > 0) {
        input = preferBottom
          ? looseCandidates.reduce((best, cur) =>
              cur.rect.bottom > best.rect.bottom ? cur : best
            ).el
          : looseCandidates[0].el;
      }
    }

    // 最后手段：忽略可见性
    if (!input) {
      input = document.querySelector('textarea')
           || document.querySelector('[contenteditable="true"]')
           || document.querySelector('input[type="text"]');
    }

    if (!input) return { filled: false, reason: 'no-input-found' };

    /* ── Step 2 & 3: Fill and submit ── */
    // 小红书：搜索区域有多个叠加 textarea，全部填一遍避免落到装饰层，
    // 并在父容器内找搜索按钮（svg 图标）点击，同时兜底派发 Enter。
    if (sourceId === 'xiaohongshu') {
      const visibleXhsInputs = xhsInputs.length > 0
        ? xhsInputs
        : Array.from(document.querySelectorAll('textarea.textarea'))
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 100 && rect.height > 0 && el.offsetParent !== null;
            });

      visibleXhsInputs.forEach((el) => fillInput(el, query));

      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            let submitted = false;
            const primary = input;
            const parent = primary.closest('form') || primary.parentElement;

            if (parent) {
              // 策略 A：点击父容器内的 svg 图标（通常是搜索按钮）
              const svgs = parent.querySelectorAll('svg');
              for (const svg of svgs) {
                const btn = svg.closest('button, a, div[role="button"]');
                if (btn && btn.offsetParent !== null) {
                  btn.click();
                  submitted = true;
                  break;
                }
              }

              // 策略 B：找父容器内文本或 aria-label 含"搜索"的按钮
              if (!submitted) {
                const buttons = parent.querySelectorAll('button, a, div[role="button"]');
                for (const btn of buttons) {
                  const text = (btn.textContent || '').trim().toLowerCase();
                  const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                  if (text.includes('搜索') || text.includes('search') ||
                      ariaLabel.includes('搜索') || ariaLabel.includes('search')) {
                    btn.click();
                    submitted = true;
                    break;
                  }
                }
              }
            }

            // 策略 C：在所有已填写的 textarea 上派发 Enter
            visibleXhsInputs.forEach((el) => {
              el.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                which: 13, bubbles: true, cancelable: true,
              }));
              setTimeout(() => {
                el.dispatchEvent(new KeyboardEvent('keyup', {
                  key: 'Enter', code: 'Enter', keyCode: 13,
                  which: 13, bubbles: true, cancelable: true,
                }));
              }, 50);
            });

            resolve({ filled: true, submitted });
          } catch (submitErr) {
            resolve({ filled: true, submitted: false, submitError: submitErr.message });
          }
        }, 500);
      });
    }

    // 其他源：正常填充并提交
    fillInput(input, query);

    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          const submitted = trySubmit(input);
          resolve({ filled: true, submitted });
        } catch (submitErr) {
          resolve({ filled: true, submitted: false, submitError: submitErr.message });
        }
      }, 500);
    });
    } catch (e) {
      return { filled: false, reason: 'exception', error: e.message, stack: e.stack };
    }
  })()`;
}

// ─── Content Extraction Script ──────────────────────────────
// Injected into each webview to extract the latest response content.
function buildExtractScript() {
  return `(() => {
    /* Strategy 1: Common response container selectors for AI chat sites & search engines */
    const selectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid="assistant-message"]',
      '.assistant-message',
      '.bot-message',
      '.ai-message',
      '.response-content',
      '.message-assistant',
      '[class*="assistant" i]',
      '[class*="response" i]',
      '[class*="answer" i]',
      '[class*="result" i]',
      '[class*="summary" i]',
      '.markdown-body',
      '.markdown-content',
      '[class*="markdown" i]',
      /* Gemini-specific */
      'model-response',
      '.model-response-text',
      '.response-container',
      'message-content[class*="model"]',
    ];

    for (const sel of selectors) {
      try {
        const elements = document.querySelectorAll(sel);
        if (elements.length > 0) {
          const last = elements[elements.length - 1];
          const text = (last.innerText || last.textContent || '').trim();
          if (text.length > 30) {
            return { text: text.substring(0, 5000), method: 'selector' };
          }
        }
      } catch (e) { /* continue */ }
    }

    /* Strategy 2: Find the largest text block in the page (likely the response) */
    try {
      const all = document.querySelectorAll('div, article, section, p');
      let best = null;
      let bestScore = 200; // minimum char threshold

      for (const el of all) {
        // Only direct text content (not containers of containers)
        if (el.children.length > 15) continue;

        const text = (el.innerText || '').trim();
        if (text.length > bestScore) {
          const rect = el.getBoundingClientRect();
          // Prefer elements that are visible and reasonably sized
          if (rect.width > 100 && rect.height > 0 && rect.top >= 0) {
            bestScore = text.length;
            best = el;
          }
        }
      }

      if (best) {
        const text = (best.innerText || '').trim();
        return { text: text.substring(0, 5000), method: 'largest-block' };
      }
    } catch (e) { /* continue */ }

    /* Strategy 3: Fallback - body text */
    try {
      const bodyText = (document.body.innerText || '').trim();
      if (bodyText.length > 50) {
        // Take the last 5000 chars (response is usually at the bottom)
        const tail = bodyText.substring(Math.max(0, bodyText.length - 5000));
        return { text: tail, method: 'body-tail' };
      }
    } catch (e) { /* continue */ }

    return { text: '', method: 'none' };
  })()`;
}

// ─── Panel Rendering ────────────────────────────────────────

/** Build HTML for a single panel. */
function buildPanelHTML(index, sourceId) {
  const config = getSourceConfig(sourceId);
  return `
    <section class="panel" data-source="${sourceId}" data-index="${index}">
      <div class="panel-header">
        <div class="panel-title">
          <span class="panel-dot" style="background: ${config.color};"></span>
          <span class="panel-name">${config.name}</span>
          <span class="panel-type-badge">${config.type}</span>
        </div>
        <div class="panel-status">
          <span class="status-badge loading">Loading...</span>
        </div>
        <div class="panel-actions">
          <button class="panel-btn swap-btn" data-index="${index}" title="Switch source">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
          </button>
          <button class="panel-btn expand-btn" data-index="${index}" title="Expand to fullscreen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
          <button class="panel-btn reload-btn" data-target="${sourceId}" title="Reload">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="panel-body">
        <webview
          id="${sourceId}"
          src="${config.url}"
          partition="persist:sources"
          allowpopups
        ></webview>
        <div class="panel-overlay" id="overlay-${sourceId}">
          <div class="overlay-content">
            <div class="spinner"></div>
            <p>Loading ${config.name}...</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

/** Render all active panels into the grid. */
function renderAllPanels() {
  panelsGrid.innerHTML = activeSources.map((id, i) => buildPanelHTML(i, id)).join('');
  initWebviews();
}

/** Attach lifecycle listeners to all current webview elements. */
function initWebviews() {
  getWebviews().forEach((wv) => attachWebviewListeners(wv));
}

/** Attach dom-ready, error, and focus listeners to a single webview. */
function attachWebviewListeners(webview) {
  const sourceId = webview.id;
  const overlay = document.getElementById(`overlay-${sourceId}`);
  const panel = webview.closest('.panel');
  const badge = panel?.querySelector('.status-badge');

  webview.addEventListener('dom-ready', () => {
    if (overlay) overlay.classList.add('hidden');
    if (badge) {
      badge.textContent = 'Ready';
      badge.className = 'status-badge ready';
    }

    // 应用当前面板或全局的缩放档位
    const panelIndex = panel ? parseInt(panel.dataset.index, 10) : -1;
    const zoomIndex = panelIndex >= 0
      ? (panelZoomIndexMap.get(panelIndex) ?? globalZoomIndex)
      : globalZoomIndex;
    safeSetZoom(webview, ZOOM_LEVELS[zoomIndex]);
  });

  webview.addEventListener('did-fail-load', () => {
    if (overlay) {
      const content = overlay.querySelector('.overlay-content');
      if (content) {
        content.innerHTML = `
          <p style="color: var(--red);">Failed to load ${getSourceConfig(sourceId).name}</p>
          <p style="margin-top:8px; font-size:12px;">Click reload to try again</p>
        `;
      }
      overlay.classList.remove('hidden');
    }
    if (badge) {
      badge.textContent = 'Error';
      badge.className = 'status-badge error';
    }
  });

  webview.addEventListener('focus', () => {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    if (panel) panel.classList.add('active');
  });
}

// ─── Source Swapping ────────────────────────────────────────

/** Replace the source in a specific panel slot. */
function swapSource(panelIndex, newSourceId) {
  const oldSourceId = activeSources[panelIndex];
  if (oldSourceId === newSourceId) return;

  activeSources[panelIndex] = newSourceId;

  // Get references before modifying DOM
  const panel = panelsGrid.querySelector(`.panel[data-index="${panelIndex}"]`);
  if (!panel) return;

  const oldWebview = panel.querySelector('webview');
  const panelBody = panel.querySelector('.panel-body');

  // Remove old webview
  if (oldWebview) oldWebview.remove();

  // Create new webview
  const config = getSourceConfig(newSourceId);
  const newWebview = document.createElement('webview');
  newWebview.id = newSourceId;
  newWebview.src = config.url;
  newWebview.setAttribute('partition', 'persist:sources');
  newWebview.setAttribute('allowpopups', '');
  panelBody.insertBefore(newWebview, panelBody.firstChild);

  // Remove old overlay
  const oldOverlay = panel.querySelector('.panel-overlay');
  if (oldOverlay) oldOverlay.remove();

  // Create new overlay
  const newOverlay = document.createElement('div');
  newOverlay.className = 'panel-overlay';
  newOverlay.id = `overlay-${newSourceId}`;
  newOverlay.innerHTML = `
    <div class="overlay-content">
      <div class="spinner"></div>
      <p>Loading ${config.name}...</p>
    </div>
  `;
  panelBody.appendChild(newOverlay);

  // Update panel data attribute
  panel.dataset.source = newSourceId;

  // Update header
  const dot = panel.querySelector('.panel-dot');
  const name = panel.querySelector('.panel-name');
  const typeBadge = panel.querySelector('.panel-type-badge');
  const statusBadge = panel.querySelector('.status-badge');

  if (dot) dot.style.background = config.color;
  if (name) name.textContent = config.name;
  if (typeBadge) typeBadge.textContent = config.type;
  if (statusBadge) {
    statusBadge.textContent = 'Loading...';
    statusBadge.className = 'status-badge loading';
  }

  // Update reload button target
  const reloadBtn = panel.querySelector('.reload-btn');
  if (reloadBtn) reloadBtn.dataset.target = newSourceId;

  // Attach listeners to new webview
  attachWebviewListeners(newWebview);
}

// ─── Fullscreen Expand ──────────────────────────────────────

/** Toggle fullscreen expand on a panel. */
function toggleExpand(panelIndex) {
  const panel = panelsGrid.querySelector(`.panel[data-index="${panelIndex}"]`);
  if (!panel) return;

  const isExpanding = !panel.classList.contains('panel-expanded');

  // Collapse any other expanded panel first
  document.querySelectorAll('.panel.panel-expanded').forEach((p) => {
    p.classList.remove('panel-expanded');
    updateExpandIcon(p, false);
  });

  if (isExpanding) {
    panel.classList.add('panel-expanded');
  }

  updateExpandIcon(panel, isExpanding);
}

/** Collapse all expanded panels. */
function collapseAll() {
  document.querySelectorAll('.panel.panel-expanded').forEach((p) => {
    p.classList.remove('panel-expanded');
    updateExpandIcon(p, false);
  });
}

/** Swap the expand button icon between expand and collapse. */
function updateExpandIcon(panel, isExpanded) {
  const btn = panel.querySelector('.expand-btn');
  if (!btn) return;

  btn.innerHTML = isExpanded
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 14 10 14 10 20"></polyline>
        <polyline points="20 10 14 10 14 4"></polyline>
        <line x1="14" y1="10" x2="21" y2="3"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>`;
}

// ─── Zoom Controls ──────────────────────────────────────────
// 支持全局缩放与面板级独立缩放：
// - 鼠标悬停或聚焦某个面板时，Ctrl/Cmd +/- 仅缩放该面板
// - 未命中任何面板时，回退到同时缩放所有面板

let globalZoomIndex = 6; // 默认 100%（ZOOM_LEVELS 索引）
const ZOOM_LEVELS = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
const panelZoomIndexMap = new Map(); // panelIndex -> zoomIndex

/** 安全设置 webview 缩放，未 ready 时静默失败 */
function safeSetZoom(webview, level) {
  try {
    webview.setZoomLevel(level);
  } catch (e) {
    // webview 未 ready 时会抛异常，dom-ready 时会再次应用
  }
}

/** 获取当前缩放目标面板索引：悬停优先，其次焦点 */
function getTargetPanelIndex() {
  const hovered = document.querySelector('.panel[data-hovered="true"]');
  if (hovered) return parseInt(hovered.dataset.index, 10);

  const active = document.querySelector('.panel.active');
  if (active) return parseInt(active.dataset.index, 10);

  return -1;
}

/** 根据 panel 索引获取对应 webview */
function getPanelWebview(panelIndex) {
  const panel = panelsGrid.querySelector(`.panel[data-index="${panelIndex}"]`);
  return panel ? panel.querySelector('webview') : null;
}

function applyZoom(delta) {
  const targetIndex = getTargetPanelIndex();

  if (targetIndex >= 0) {
    // 面板级缩放
    const currentIdx = panelZoomIndexMap.get(targetIndex) ?? globalZoomIndex;
    const newIndex = currentIdx + delta;
    if (newIndex < 0 || newIndex >= ZOOM_LEVELS.length) return;

    panelZoomIndexMap.set(targetIndex, newIndex);
    const wv = getPanelWebview(targetIndex);
    if (wv) safeSetZoom(wv, ZOOM_LEVELS[newIndex]);
  } else {
    // 全局缩放
    const newIndex = globalZoomIndex + delta;
    if (newIndex < 0 || newIndex >= ZOOM_LEVELS.length) return;

    globalZoomIndex = newIndex;
    getWebviews().forEach((wv) => safeSetZoom(wv, ZOOM_LEVELS[newIndex]));
  }

  updateZoomIndicator();
}

function resetZoom() {
  const targetIndex = getTargetPanelIndex();

  if (targetIndex >= 0) {
    panelZoomIndexMap.set(targetIndex, 6);
    const wv = getPanelWebview(targetIndex);
    if (wv) safeSetZoom(wv, 0);
  } else {
    globalZoomIndex = 6;
    panelZoomIndexMap.clear();
    getWebviews().forEach((wv) => safeSetZoom(wv, 0));
  }

  updateZoomIndicator();
}

function updateZoomIndicator() {
  const indicator = document.getElementById('zoom-indicator');
  if (!indicator) return;

  const targetIndex = getTargetPanelIndex();
  const zoomIndex = targetIndex >= 0
    ? (panelZoomIndexMap.get(targetIndex) ?? globalZoomIndex)
    : globalZoomIndex;

  const percent = Math.round(Math.pow(1.2, ZOOM_LEVELS[zoomIndex]) * 100);
  indicator.textContent = `${percent}%`;
  indicator.classList.add('visible');

  clearTimeout(indicator._timeout);
  indicator._timeout = setTimeout(() => {
    indicator.classList.remove('visible');
  }, 1500);
}

/** 根据 webview 的 WebContents ID 找到对应面板并缩放 */
function applyZoomToWebview(webviewId, delta) {
  const wv = Array.from(getWebviews()).find((w) => w.getWebContentsId() === webviewId);
  if (!wv) return;

  const panel = wv.closest('.panel');
  const panelIndex = panel ? parseInt(panel.dataset.index, 10) : -1;
  if (panelIndex < 0) return;

  const currentIdx = panelZoomIndexMap.get(panelIndex) ?? globalZoomIndex;
  const newIndex = currentIdx + delta;
  if (newIndex < 0 || newIndex >= ZOOM_LEVELS.length) return;

  panelZoomIndexMap.set(panelIndex, newIndex);
  safeSetZoom(wv, ZOOM_LEVELS[newIndex]);
  updateZoomIndicator();
}

/** 根据 webview 的 WebContents ID 重置对应面板缩放 */
function resetZoomToWebview(webviewId) {
  const wv = Array.from(getWebviews()).find((w) => w.getWebContentsId() === webviewId);
  if (!wv) return;

  const panel = wv.closest('.panel');
  const panelIndex = panel ? parseInt(panel.dataset.index, 10) : -1;
  if (panelIndex < 0) return;

  panelZoomIndexMap.set(panelIndex, 6);
  safeSetZoom(wv, 0);
  updateZoomIndicator();
}

// ─── Source Picker Modal ────────────────────────────────────

function showSourcePicker(panelIndex) {
  swapPanelIndex = panelIndex;
  const modal = document.getElementById('source-picker-modal');
  const grid = document.getElementById('source-picker-grid');

  grid.innerHTML = Object.entries(ALL_SOURCES).map(([id, config]) => {
    const isActive = activeSources.includes(id);
    const isCurrentPanel = activeSources[panelIndex] === id;
    return `
      <div class="source-option ${isCurrentPanel ? 'current' : ''} ${isActive && !isCurrentPanel ? 'active-elsewhere' : ''}"
           data-source-id="${id}">
        <div class="source-option-header">
          <img class="source-option-dot" src="${config.logo || ''}" alt="">
          <span class="source-option-name">${config.name}</span>
          <span class="source-option-type">${config.type}</span>
        </div>
        <div class="source-option-value">${config.uniqueValue}</div>
        ${isCurrentPanel ? '<div class="source-option-current">Current</div>' : ''}
      </div>
    `;
  }).join('');

  modal.classList.add('visible');

  // Attach click handlers to options
  grid.querySelectorAll('.source-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const newId = opt.dataset.sourceId;
      if (swapPanelIndex >= 0 && newId) {
        swapSource(swapPanelIndex, newId);
      }
      hideSourcePicker();
    });
  });
}

function hideSourcePicker() {
  const modal = document.getElementById('source-picker-modal');
  if (modal) modal.classList.remove('visible');
  swapPanelIndex = -1;
}

// ─── Settings Modal ─────────────────────────────────────────

const settingsModal = document.getElementById('settings-modal');
const settingsBaseUrl = document.getElementById('settings-base-url');
const settingsApiKey = document.getElementById('settings-api-key');
const settingsModel = document.getElementById('settings-model');
const settingsStatus = document.getElementById('settings-status');
const btnSaveSettings = document.getElementById('btn-save-settings');

async function showSettings() {
  try {
    const config = await window.electronAPI.getLLMConfig();
    settingsBaseUrl.value = config.baseUrl || '';
    settingsApiKey.value = config.apiKey || '';
    settingsModel.value = config.model || '';
    settingsStatus.textContent = '';
  } catch (err) {
    console.warn('[3for] Failed to load settings:', err);
  }
  settingsModal.classList.add('visible');
}

function hideSettings() {
  settingsModal.classList.remove('visible');
}

async function saveSettings() {
  try {
    await window.electronAPI.saveLLMConfig({
      baseUrl: settingsBaseUrl.value.trim(),
      apiKey: settingsApiKey.value.trim(),
      model: settingsModel.value.trim(),
    });
    settingsStatus.textContent = '✓ 设置已保存';
    settingsStatus.style.color = 'var(--green)';
    setTimeout(() => {
      hideSettings();
    }, 800);
  } catch (err) {
    settingsStatus.textContent = '保存失败: ' + err.message;
    settingsStatus.style.color = 'var(--red)';
  }
}

// Preset buttons fill in base URL and model name
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    settingsBaseUrl.value = btn.dataset.baseUrl || '';
    settingsModel.value = btn.dataset.model || '';
  });
});

// ─── Search Broadcasting ────────────────────────────────────

/**
 * Inject the auto-fill script into a single webview.
 * Retries up to maxRetries times if the input element is not found yet.
 */
async function fillWebview(webview, query, maxRetries = 3) {
  const preferBottom = isLLMSource(webview.id);
  const script = buildFillScript(query, { preferBottom, sourceId: webview.id });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await webview.executeJavaScript(script);

      if (result && result.filled) {
        console.log(`[3for] ${webview.id}: filled successfully`, result);
        return result;
      }

      // Input not found yet, wait and retry
      if (attempt < maxRetries - 1) {
        console.log(`[3for] ${webview.id}: input not found, retry ${attempt + 1}/${maxRetries}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      console.warn(`[3for] ${webview.id}: injection error (attempt ${attempt + 1}):`, err.message);
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  console.warn(`[3for] ${webview.id}: failed after ${maxRetries} attempts`);
  return { filled: false, reason: 'max-retries-exceeded' };
}

/**
 * Broadcast the search query from the top bar to ALL webviews simultaneously.
 */
async function broadcastSearch(query) {
  if (!query.trim()) return;

  // Visual feedback on the search bar
  mainSearch.classList.add('searching');
  setTimeout(() => mainSearch.classList.remove('searching'), 800);

  // Snapshot current webviews for consistent iteration
  const wvs = Array.from(getWebviews());

  // Fire all webviews in parallel
  const promises = wvs.map((wv) => fillWebview(wv, query));
  const results = await Promise.allSettled(promises);

  // Log summary
  results.forEach((r, i) => {
    const id = wvs[i]?.id || `webview-${i}`;
    if (r.status === 'fulfilled') {
      console.log(`[3for] ${id}:`, r.value);
    } else {
      console.error(`[3for] ${id}: rejected`, r.reason);
    }
  });
}

// ─── Summary Drawer ─────────────────────────────────────────

const summaryDrawer = document.getElementById('summary-drawer');
const btnSummary = document.getElementById('btn-summary');
const drawerCloseBtn = document.getElementById('drawer-close-btn');
const btnGenerate = document.getElementById('btn-generate');
const btnRetry = document.getElementById('btn-retry');
const summaryIdle = document.getElementById('summary-idle');
const summaryLoading = document.getElementById('summary-loading');
const summaryResult = document.getElementById('summary-result');
const summaryError = document.getElementById('summary-error');
const summaryConclusion = document.getElementById('summary-conclusion');
const summaryHighlights = document.getElementById('summary-highlights');
const summaryLoadingText = document.getElementById('summary-loading-text');
const summaryErrorText = document.getElementById('summary-error-text');
const btnRegenerate = document.getElementById('btn-regenerate');

/** Toggle the summary drawer open/closed */
function toggleSummary() {
  const isOpen = summaryDrawer.classList.toggle('open');
  btnSummary.classList.toggle('active', isOpen);
}

/** Close the summary drawer */
function closeSummary() {
  summaryDrawer.classList.remove('open');
  btnSummary.classList.remove('active');
}

/** Show a specific summary state (idle, loading, result, error) */
function showSummaryState(state) {
  summaryIdle.style.display = state === 'idle' ? '' : 'none';
  summaryLoading.style.display = state === 'loading' ? '' : 'none';
  summaryResult.style.display = state === 'result' ? '' : 'none';
  summaryError.style.display = state === 'error' ? '' : 'none';
}

/**
 * Extract content from a single webview.
 * @returns {Promise<{text: string, method: string}>}
 */
async function extractFromWebview(webview) {
  const script = buildExtractScript();
  try {
    const result = await webview.executeJavaScript(script);
    return result || { text: '', method: 'none' };
  } catch (err) {
    console.warn(`[3for] extract error for ${webview.id}:`, err.message);
    return { text: '', method: 'error' };
  }
}

/**
 * Main summary generation flow:
 * 1. Extract content from all webviews
 * 2. Build prompt with source-specific guidance
 * 3. Call DeepSeek API via IPC
 * 4. Parse and render the result
 */
async function generateSummary() {
  // Open the drawer if not already open
  if (!summaryDrawer.classList.contains('open')) {
    toggleSummary();
  }

  // Step 1: Extract content
  showSummaryState('loading');
  summaryLoadingText.textContent = '正在提取各信息源内容...';

  const sourceContents = {};
  const wvs = Array.from(getWebviews());
  const extractPromises = wvs.map(async (wv) => {
    const sourceId = wv.id;
    const result = await extractFromWebview(wv);
    sourceContents[sourceId] = result.text;
    console.log(`[3for] extract ${sourceId}: ${result.text ? result.text.length + ' chars (method: ' + result.method + ')' : 'empty'}`);
  });

  await Promise.allSettled(extractPromises);

  // Filter non-empty sources
  const validSources = Object.entries(sourceContents).filter(([, text]) => text && text.length > 20);

  if (validSources.length === 0) {
    summaryErrorText.textContent = '未检测到有效内容。请先在各信息源中搜索，等待结果加载后再试。';
    showSummaryState('error');
    return;
  }

  // Step 2: Build prompt with source-specific guidance
  summaryLoadingText.textContent = `已提取 ${validSources.length} 个来源，AI 正在分析总结...`;

  const promptContent = validSources
    .map(([id, text]) => `【${getSourceConfig(id).name}】\n${text}`)
    .join('\n\n---\n\n');

  // Build dynamic format instructions based on active sources
  const sourceInstructions = validSources
    .map(([id]) => {
      const config = getSourceConfig(id);
      return `【${config.name}】\n- 亮点1（突出${config.name}作为${config.type}的独特价值：${config.uniqueValue}）\n- 亮点2`;
    })
    .join('\n\n');

  const fullPrompt =
    `以下是用户问题 "${mainSearch.value.trim()}" 在不同信息源中的搜索结果：\n\n` +
    promptContent +
    '\n\n请综合分析以上来自不同信息源的内容，注意：\n' +
    '1. 结论必须综合所有信息源的观点，不要仅依赖单一来源\n' +
    '2. 各来源亮点应突出该来源的独特价值，让读者了解不同信息源的互补优势\n\n' +
    '输出格式：\n' +
    '1. **一句话结论**（不超过50字，综合所有来源给出最核心的判断）\n' +
    '2. **各来源亮点**（每个来源2-3个要点，用 - 开头的列表格式）\n\n' +
    '请严格按照以下格式输出：\n\n' +
    '【结论】\n你的一句话结论\n\n' +
    sourceInstructions;

  try {
    const response = await window.electronAPI.summarize(fullPrompt);

    if (response.error) {
      summaryErrorText.textContent = response.error;
      showSummaryState('error');
      return;
    }

    renderSummaryResult(response.result, validSources);
    showSummaryState('result');
  } catch (err) {
    summaryErrorText.textContent = err.message || 'An unexpected error occurred';
    showSummaryState('error');
  }
}

/**
 * Parse and render the DeepSeek summary result.
 * Dynamically handles whatever sources are currently active.
 */
function renderSummaryResult(text, validSources) {
  // Parse conclusion
  const conclusionMatch = text.match(/【结论】\s*\n?([\s\S]*?)(?=【|$)/);
  const conclusion = conclusionMatch ? conclusionMatch[1].trim() : '';
  summaryConclusion.textContent = conclusion || '(未提取到结论)';

  // Parse per-source highlights dynamically
  summaryHighlights.innerHTML = '';

  for (const [id] of validSources) {
    const config = getSourceConfig(id);
    const escapedKey = config.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`【${escapedKey}】\\s*\\n?([\\s\\S]*?)(?=【|$)`);
    const match = text.match(regex);
    const content = match ? match[1].trim() : '';

    const card = document.createElement('div');
    card.className = 'highlight-card';

    // Header: colored dot + name + type badge
    const header = document.createElement('div');
    header.className = 'highlight-header';

    const dot = document.createElement('span');
    dot.className = 'highlight-dot';
    dot.style.background = config.color;

    const name = document.createElement('span');
    name.className = 'highlight-name';
    name.textContent = config.name;

    const badge = document.createElement('span');
    badge.className = 'highlight-badge';
    badge.style.background = `${config.color}22`;
    badge.style.color = config.color;
    badge.textContent = config.type;

    header.appendChild(dot);
    header.appendChild(name);
    header.appendChild(badge);
    card.appendChild(header);

    // Content: render as formatted list or fallback text
    const contentEl = document.createElement('div');
    contentEl.className = 'highlight-content';

    if (content) {
      const lines = content.split('\n').filter((l) => l.trim());
      const listItems = lines.filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));

      if (listItems.length > 0) {
        const ul = document.createElement('ul');
        for (const line of listItems) {
          const li = document.createElement('li');
          li.textContent = line.replace(/^[-*]\s*/, '');
          ul.appendChild(li);
        }
        contentEl.appendChild(ul);
      } else {
        contentEl.textContent = content;
      }
    } else {
      contentEl.innerHTML = '<span class="highlight-empty">该来源未提取到内容</span>';
    }

    card.appendChild(contentEl);
    summaryHighlights.appendChild(card);
  }
}

// ─── Event Listeners ────────────────────────────────────────

// Summary drawer
btnSummary.addEventListener('click', toggleSummary);
drawerCloseBtn.addEventListener('click', closeSummary);
btnGenerate.addEventListener('click', generateSummary);
btnRetry.addEventListener('click', generateSummary);
if (btnRegenerate) {
  btnRegenerate.addEventListener('click', generateSummary);
}

// Source picker close
document.getElementById('source-picker-close').addEventListener('click', hideSourcePicker);
document.getElementById('source-picker-modal').addEventListener('click', (e) => {
  if (e.target.id === 'source-picker-modal') hideSourcePicker();
});

// Settings modal
document.getElementById('btn-settings').addEventListener('click', showSettings);
document.getElementById('settings-close').addEventListener('click', hideSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target.id === 'settings-modal') hideSettings();
});
btnSaveSettings.addEventListener('click', saveSettings);

// Main search bar: Enter to broadcast
mainSearch.addEventListener('keydown', (e) => {
  // 忽略中文输入法组合过程中的 Enter（用户用 Enter 确认英文输入时不应搜索）
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    broadcastSearch(mainSearch.value.trim());
  }
});

// ─── Panel Actions (event delegation on grid) ───────────────

panelsGrid.addEventListener('click', (e) => {
  // Reload button
  const reloadBtn = e.target.closest('.reload-btn');
  if (reloadBtn) {
    const targetId = reloadBtn.dataset.target;
    const wv = document.getElementById(targetId);
    const overlay = document.getElementById(`overlay-${targetId}`);
    const panel = reloadBtn.closest('.panel');
    const badge = panel?.querySelector('.status-badge');

    if (overlay) {
      overlay.querySelector('.overlay-content').innerHTML = `
        <div class="spinner"></div>
        <p>Loading ${getSourceConfig(targetId).name}...</p>
      `;
      overlay.classList.remove('hidden');
    }
    if (badge) {
      badge.textContent = 'Loading...';
      badge.className = 'status-badge loading';
    }
    if (wv) wv.reload();
    return;
  }

  // Expand button
  const expandBtn = e.target.closest('.expand-btn');
  if (expandBtn) {
    const panelIndex = parseInt(expandBtn.dataset.index, 10);
    toggleExpand(panelIndex);
    return;
  }

  // Swap button
  const swapBtn = e.target.closest('.swap-btn');
  if (swapBtn) {
    const panelIndex = parseInt(swapBtn.dataset.index, 10);
    showSourcePicker(panelIndex);
    return;
  }
});

// Reload all webviews
reloadAllBtn.addEventListener('click', () => {
  getWebviews().forEach((wv) => {
    const id = wv.id;
    const overlay = document.getElementById(`overlay-${id}`);
    const panel = wv.closest('.panel');
    const badge = panel?.querySelector('.status-badge');

    if (overlay) {
      overlay.querySelector('.overlay-content').innerHTML = `
        <div class="spinner"></div>
        <p>Loading ${getSourceConfig(id).name}...</p>
      `;
      overlay.classList.remove('hidden');
    }
    if (badge) {
      badge.textContent = 'Loading...';
      badge.className = 'status-badge loading';
    }
    wv.reload();
  });
});

// 一键为所有 LLM 源新建对话
const btnNewChat = document.getElementById('btn-new-chat');
if (btnNewChat) {
  btnNewChat.addEventListener('click', () => {
    getWebviews().forEach((wv) => {
      if (isLLMSource(wv.id)) triggerNewChat(wv);
    });
  });
}

// ─── Keyboard Shortcuts ─────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const isMod = e.ctrlKey || e.metaKey;

  // Ctrl/Cmd + L: Focus the main search bar
  if (isMod && e.key === 'l') {
    e.preventDefault();
    mainSearch.focus();
    mainSearch.select();
  }

  // Ctrl/Cmd + R: Reload all webviews
  if (isMod && e.key === 'r') {
    e.preventDefault();
    reloadAllBtn.click();
  }

  // Ctrl/Cmd + Plus: Zoom in (all webviews)
  if (isMod && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    applyZoom(1);
  }

  // Ctrl/Cmd + Minus: Zoom out (all webviews)
  if (isMod && e.key === '-') {
    e.preventDefault();
    applyZoom(-1);
  }

  // Ctrl/Cmd + 0: Reset zoom
  if (isMod && e.key === '0') {
    e.preventDefault();
    resetZoom();
  }

  // Escape: blur search bar, close picker, close drawer, collapse fullscreen, close settings
  if (e.key === 'Escape') {
    mainSearch.blur();
    hideSourcePicker();
    hideSettings();
    closeSummary();
    collapseAll();
  }
});

/** 监听鼠标进出面板，用于判定缩放目标 */
function initPanelHoverTracking() {
  panelsGrid.addEventListener('mouseenter', (e) => {
    const panel = e.target.closest('.panel');
    if (panel) panel.dataset.hovered = 'true';
  }, true);

  panelsGrid.addEventListener('mouseleave', (e) => {
    const panel = e.target.closest('.panel');
    if (panel) panel.dataset.hovered = 'false';
  }, true);
}

// ─── Initialize ─────────────────────────────────────────────

function init() {
  renderAllPanels();
  initPanelHoverTracking();

  // 注册来自 webview 的缩放快捷键转发
  window.electronAPI.onWebviewZoomIn(({ webviewId }) => applyZoomToWebview(webviewId, 1));
  window.electronAPI.onWebviewZoomOut(({ webviewId }) => applyZoomToWebview(webviewId, -1));
  window.electronAPI.onWebviewZoomReset(({ webviewId }) => resetZoomToWebview(webviewId));

  mainSearch.focus();
}

// Ensure init runs even if DOMContentLoaded already fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
