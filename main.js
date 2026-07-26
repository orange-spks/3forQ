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
    const response = await fetch(llmConfig.baseUrl, {
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
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
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

  // 转发缩放快捷键与阅读器查找快捷键
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
  setupMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
