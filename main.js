/**
 * 3for - Electron Main Process
 *
 * Creates the application window with webview support enabled.
 * Search logic runs directly in the renderer (no IPC round-trip needed).
 * Summary logic uses IPC: renderer → main → LLM API → main → renderer.
 *
 * LLM provider is configurable: any OpenAI-compatible API (DeepSeek, Qwen,
 * Kimi/Moonshot, Guiji, OpenAI, etc.). User sets base URL + API key + model.
 */

const { app, BrowserWindow, ipcMain, Menu, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// ─── Application Icon ───────────────────────────────────────
// 使用 logo/3forQ-logo.png 作为窗口图标；macOS 额外设置 Dock 图标。
// .icns / .ico 已生成到 logo/ 目录，供后续打包工具（electron-builder / forge）使用。
const APP_ICON_PATH = path.join(__dirname, 'logo', '3forQ-logo.png');

function setApplicationIcon() {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(APP_ICON_PATH);
  }
}

// ─── LLM Configuration ──────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'llm-config.json');
const LEGACY_KEY_PATH = path.join(__dirname, 'deepseek-api');

let llmConfig = {
  baseUrl: 'https://api.deepseek.com/chat/completions',
  apiKey: '',
  model: 'deepseek-chat',
};

function loadLLMConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (data.baseUrl) llmConfig.baseUrl = data.baseUrl;
      if (data.apiKey) llmConfig.apiKey = data.apiKey;
      if (data.model) llmConfig.model = data.model;
      console.log('[3for] LLM config loaded from llm-config.json');
      return;
    }
  } catch (err) {
    console.warn('[3for] Could not load llm-config.json:', err.message);
  }

  // Fallback: try legacy deepseek-api file for backward compatibility
  try {
    if (fs.existsSync(LEGACY_KEY_PATH)) {
      llmConfig.apiKey = fs.readFileSync(LEGACY_KEY_PATH, 'utf-8').trim();
      console.log('[3for] DeepSeek API key loaded from legacy file');
    }
  } catch (err) {
    console.warn('[3for] Could not load legacy API key:', err.message);
  }
}

function saveLLMConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(llmConfig, null, 2));
    console.log('[3for] LLM config saved');
  } catch (err) {
    console.error('[3for] Failed to save LLM config:', err.message);
  }
}

/**
 * Ensure the configured base URL points to the chat completions endpoint.
 * Users may paste either the API base URL (e.g. https://api.siliconflow.cn/v1)
 * or the full endpoint URL (e.g. https://api.deepseek.com/chat/completions).
 */
function normalizeChatCompletionsUrl(baseUrl) {
  const url = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (url.endsWith('/chat/completions')) return url;
  return `${url}/chat/completions`;
}

loadLLMConfig();

// ─── Application Menu (important for Windows UX) ────────────
function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : [
          {
            label: '文件',
            submenu: [{ role: 'quit', label: '退出' }],
          },
        ]),
    {
      label: isMac ? 'Edit' : '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: isMac ? 'View' : '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
      ],
    },
    {
      label: isMac ? 'Window' : '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close', label: '关闭' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC: Summarize via configurable LLM ────────────────────
ipcMain.handle('summarize', async (_event, { content }) => {
  if (!llmConfig.apiKey) {
    return {
      error:
        '未配置 API Key。请点击右上角设置按钮 ⚙ 配置 LLM 供应商信息。',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(normalizeChatCompletionsUrl(llmConfig.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          {
            role: 'system',
            content:
              '你是一个专业的多源信息综合分析助手。用户会提供来自多个不同类型信息源的搜索结果（可能包括LLM、搜索引擎、社区等）。\n' +
              '你需要综合分析这些内容，提供：\n' +
              '1. 一句话结论：综合所有信息源的观点，给出最核心的回答（不超过50字）\n' +
              '2. 各来源亮点：提取每个来源中最有价值的2-3个要点\n\n' +
              '核心要求：\n' +
              '- 结论必须综合所有信息源，不要仅依赖单一来源，要有独立判断力\n' +
              '- 各来源亮点应突出该来源的独特价值（如LLM的深度推理、社区的真实用户体验、搜索引擎的广泛覆盖等），而非泛泛重复\n' +
              '- 亮点要具体、有信息增量，不要泛泛而谈\n' +
              '- 如果不同来源有矛盾观点，在结论中明确指出\n' +
              '- 如果某个来源没有有效内容，跳过该来源即可',
          },
          {
            role: 'user',
            content,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `API 请求错误 (${response.status}): ${errorText}` };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return { error: 'API 返回空内容，请检查模型配置是否正确' };
    }

    return { result: text };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { error: '请求超时（120秒），请重试。' };
    }
    return { error: err.message };
  }
});

// ─── IPC: LLM Config Management ─────────────────────────────
ipcMain.handle('get-llm-config', () => ({ ...llmConfig }));

// 渲染进程诊断日志转发到终端，便于排查 webview 注入问题
ipcMain.on('debug-log', (_event, msg) => console.log(msg));

ipcMain.handle('save-llm-config', (_event, config) => {
  if (config.baseUrl) llmConfig.baseUrl = config.baseUrl.trim();
  if (config.apiKey !== undefined) llmConfig.apiKey = config.apiKey.trim();
  if (config.model) llmConfig.model = config.model.trim();
  saveLLMConfig();
  return { success: true };
});

// ─── Window Creation ────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 700,
    title: '3for - Multi-Source Search',
    icon: APP_ICON_PATH,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      // sandboxed preload 里没有 __dirname / path 模块，
      // webview guest preload 的路径只能从主进程经 additionalArguments 传入
      additionalArguments: [
        `--webview-preload=file://${path.join(__dirname, 'src', 'webview-preload.js')}`,
      ],
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Reader Window ──────────────────────────────────────────
// 单例多标签阅读器，用于打开源 webview 中的外部链接

let readerWindow = null;

function getOrCreateReaderWindow() {
  if (readerWindow && !readerWindow.isDestroyed()) {
    if (readerWindow.isMinimized()) readerWindow.restore();
    readerWindow.focus();
    return readerWindow;
  }

  readerWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: '3for Reader',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  readerWindow.loadFile(path.join(__dirname, 'src', 'reader.html'));

  readerWindow.on('closed', () => {
    readerWindow = null;
  });

  return readerWindow;
}

async function openReaderWindow(url) {
  if (!url || !url.startsWith('http')) return;

  const win = getOrCreateReaderWindow();
  const sendAddTab = () => win.webContents.send('reader-add-tab', url);

  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once('did-finish-load', sendAddTab);
  } else {
    sendAddTab();
  }
}

ipcMain.handle('open-reader', (_event, url) => openReaderWindow(url));

ipcMain.handle('copy-text', async (_event, text) => {
  clipboard.writeText(text || '');
});

ipcMain.handle('open-external', async (_event, url) => {
  if (url && url.startsWith('http')) {
    await shell.openExternal(url);
  }
});

// 将 Markdown 内容写入系统默认下载目录；文件名冲突时自动追加 -1/-2 后缀
ipcMain.handle('save-markdown', async (_event, { filename, content }) => {
  try {
    const downloadsDir = app.getPath('downloads');
    // 清洗文件名中的非法字符（跨平台保守处理）
    const safeName = String(filename || '3for-export')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim() || '3for-export';

    let finalPath = path.join(downloadsDir, `${safeName}.md`);
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(downloadsDir, `${safeName}-${counter}.md`);
      counter += 1;
    }

    fs.writeFileSync(finalPath, content, 'utf8');
    return { success: true, path: finalPath };
  } catch (err) {
    console.error('[3for] save-markdown 失败:', err);
    return { success: false, error: err.message };
  }
});

// ─── Intercept webview keyboard / navigation ────────────────
// webview 聚焦时，渲染进程无法直接收到其内部的键盘事件，
// 因此在主进程统一拦截缩放、打开新窗口和外部跳转。

function sendToOwnerWindow(contents, channel, ...args) {
  const win = contents.getOwnerBrowserWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

function normalizeHost(host) {
  return (host || '').replace(/^www\./, '').toLowerCase();
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  const owner = contents.getOwnerBrowserWindow();
  if (!owner) return;

  // 所有新窗口请求都统一转为阅读器标签（源面板）或阅读器内新标签
  contents.setWindowOpenHandler((details) => {
    const url = details.url;
    if (url && url.startsWith('http')) {
      if (owner === readerWindow) {
        owner.webContents.send('reader-add-tab', url);
      } else {
        openReaderWindow(url);
      }
    }
    return { action: 'deny' };
  });

  // 外部域名跳转也进入阅读器；阅读器内部 webview 的跳转不拦截
  contents.on('will-navigate', (event, url) => {
    if (owner === readerWindow) return;

    const currentUrl = contents.getURL();
    if (!currentUrl.startsWith('http') || !url.startsWith('http')) return;

    try {
      const currentHost = normalizeHost(new URL(currentUrl).host);
      const newHost = normalizeHost(new URL(url).host);
      if (currentHost && newHost && currentHost !== newHost) {
        event.preventDefault();
        openReaderWindow(url);
      }
    } catch (e) {
      // ignore malformed urls
    }
  });

  // 转发缩放快捷键与阅读器查找快捷键。
  // 注意：Esc（退出面板全屏）不在这里转发——站点可能自己消费 Esc（如小红书
  // 帖子弹层），改由 src/webview-preload.js 在页面上下文判定后经 sendToHost 上报。
  contents.on('before-input-event', (event, input) => {
    const isMod = input.control || input.meta;
    if (!isMod) return;

    if (input.key === '=' || input.key === '+') {
      event.preventDefault();
      sendToOwnerWindow(contents, 'webview-zoom-in', { webviewId: contents.id });
      return;
    }
    if (input.key === '-') {
      event.preventDefault();
      sendToOwnerWindow(contents, 'webview-zoom-out', { webviewId: contents.id });
      return;
    }
    if (input.key === '0') {
      event.preventDefault();
      sendToOwnerWindow(contents, 'webview-zoom-reset', { webviewId: contents.id });
      return;
    }
    if (input.key === 'f' && owner === readerWindow) {
      event.preventDefault();
      sendToOwnerWindow(contents, 'reader-focus-find');
    }
  });
});

app.whenReady().then(() => {
  // 清掉残留 Dock 角标：站点 Badging API（如 Kimi 未读数）可能穿透写到 Dock，
  // 启动时统一清空
  if (app.dock) app.dock.setBadge('');

  // 兜底：主世界注入与站点脚本存在时序竞争，万一漏网（或 macOS 通知中心重写），
  // 轮询发现角标非空即清掉，保证 Dock 角标始终为空
  setInterval(() => {
    if (app.dock && app.dock.getBadge() !== '') app.dock.setBadge('');
  }, 3000);

  setupMenu();
  setApplicationIcon();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
