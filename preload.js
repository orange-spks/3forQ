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

contextBridge.exposeInMainWorld('appInfo', {
  version: '1.3.0',
  platform: process.platform,
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
});
