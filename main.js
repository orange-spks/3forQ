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

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
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
