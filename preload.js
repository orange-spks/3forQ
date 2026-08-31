/**
 * 3for - Preload Script
 *
 * Exposes app metadata and IPC methods to the renderer via contextBridge.
 * Search logic runs directly in the renderer via webview.executeJavaScript(),
 * so no IPC is needed for the core search functionality.
 * Summary logic uses IPC through the summarize method.
 * LLM config management uses get-llm-config / save-llm-config.
 */

const { contextBridge, ipcRenderer } = require('electron');

// sandboxed preload 中没有 __dirname，也没有 path 模块，
// webview guest preload 路径由主进程经 additionalArguments 传入。
// 项目路径含中文（Downloads/编程/），需 encodeURI 转成合法 file URL。
const webviewPreloadArg = (process.argv || [])
  .find((a) => a.startsWith('--webview-preload='));
const webviewPreloadPath = webviewPreloadArg
  ? encodeURI(webviewPreloadArg.slice('--webview-preload='.length))
  : '';

contextBridge.exposeInMainWorld('appInfo', {
  version: '1.3.0',
  platform: process.platform,
  /** webview guest preload 的 file:// 路径，供渲染进程创建 webview 标签时使用 */
  webviewPreloadPath,
});

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Send content to the main process for LLM summarization.
   * @param {string} content - The aggregated source content to summarize.
   * @returns {Promise<{result?: string, error?: string}>}
   */
  summarize: (content) => ipcRenderer.invoke('summarize', { content }),

  /**
   * Get current LLM configuration.
   * @returns {Promise<{baseUrl: string, apiKey: string, model: string}>}
   */
  getLLMConfig: () => ipcRenderer.invoke('get-llm-config'),

  /**
   * Save LLM configuration.
   * @param {{baseUrl?: string, apiKey?: string, model?: string}} config
   * @returns {Promise<{success: boolean}>}
   */
  saveLLMConfig: (config) => ipcRenderer.invoke('save-llm-config', config),

  /** 在阅读器窗口中以外部链接打开新标签 */
  openReader: (url) => ipcRenderer.invoke('open-reader', url),

  /** 复制文本到系统剪贴板 */
  copyText: (text) => ipcRenderer.invoke('copy-text', text),

  /** 使用系统默认浏览器打开链接 */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /**
   * 将 Markdown 内容保存到系统默认下载目录。
   * @param {{filename: string, content: string}} payload
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  saveMarkdown: (payload) => ipcRenderer.invoke('save-markdown', payload),

  /** 渲染进程诊断日志转发到主进程（终端可见），用于排查 webview 注入问题 */
  debugLog: (msg) => ipcRenderer.send('debug-log', msg),

  /** 阅读器窗口新增标签页的监听 */
  onReaderAddTab: (callback) => ipcRenderer.on('reader-add-tab', (_event, url) => callback(url)),

  /** webview 聚焦时转发的缩放按键 */
  onWebviewZoomIn: (callback) => ipcRenderer.on('webview-zoom-in', (_event, payload) => callback(payload)),
  onWebviewZoomOut: (callback) => ipcRenderer.on('webview-zoom-out', (_event, payload) => callback(payload)),
  onWebviewZoomReset: (callback) => ipcRenderer.on('webview-zoom-reset', (_event, payload) => callback(payload)),

  /** 阅读器内 webview 聚焦时按 Ctrl/Cmd+F 的转发 */
  onReaderFocusFind: (callback) => ipcRenderer.on('reader-focus-find', () => callback()),
});
