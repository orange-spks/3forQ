# 3for 使用手册

> 一次提问，多源搜寻 — 多源信息聚合搜索平台

---

## 目录

- [简介](#简介)
- [安装](#安装)
- [启动应用](#启动应用)
- [基本使用](#基本使用)
- [信息源说明](#信息源说明)
- [AI 答案总结](#ai-答案总结)
- [LLM 设置](#llm-设置)
- [快捷键](#快捷键)
- [常见问题](#常见问题)

---

## 简介

3for 是一款基于 Electron 的多源信息聚合搜索工具。它的核心理念是：与其向 10 个相似的 LLM 提问得到 10 个相似的答案，不如一次提问，从**完全不同的信息源类型**获取互补的结果。

通过浏览器模拟技术，3for 将多个信息源（LLM、搜索引擎、社区等）嵌入到同一个窗口中，让你只需输入一次问题，就能同时在多个平台获得答案。

---

## 安装

### 系统要求

- **操作系统**：Windows 10+、macOS 10.15+、Linux
- **Node.js**：版本 18 或更高
- **网络**：需要能够访问各信息源网站

### 安装步骤

#### 1. 安装 Node.js

如果你的电脑上还没有安装 Node.js，请前往 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。

安装完成后，打开终端（Windows 用户打开 PowerShell 或命令提示符），验证安装：

```bash
node --version
npm --version
```

两个命令都应该输出版本号。

#### 2. 下载项目文件

将项目文件复制到你的电脑上。确保以下文件都在同一个目录中：

```
3for/
├── main.js
├── preload.js
├── package.json
├── package-lock.json
├── src/
│   ├── index.html
│   ├── renderer.js
│   └── styles.css
└── deepseek-api          (可选，旧版 API Key 文件)
```

#### 3. 安装依赖

在项目根目录下打开终端，运行：

```bash
npm install
```

这将自动下载并安装 Electron 和所有必要的依赖包。根据网络速度，可能需要 1-5 分钟。

安装完成后，你会看到类似提示：

```
added XX packages in Xs
```

---

## 启动应用

在终端中运行：

```bash
npm start
```

或者，如果你需要开发者模式（带 DevTools 调试工具）：

```bash
npm run dev
```

应用启动后会显示一个 2×2 的面板布局，每个面板加载一个信息源网站。

### 首次使用 — 登录账号

首次启动时，各面板会加载对应的网站。你需要手动登录想要使用的账号：

1. **ChatGPT**：点击面板中的 ChatGPT 页面，登录你的 OpenAI 账号
2. **Doubao（豆包）**：点击面板中的豆包页面，登录你的字节账号
3. **Kimi**：点击面板中的 Kimi 页面，登录你的 Moonshot 账号
4. **其他信息源**：类似操作

> **提示**：登录状态会自动保存，下次启动应用时无需重新登录。

---

## 基本使用

### 统一搜索

1. 在顶部的搜索栏中输入你的问题
2. 按下 **Enter** 键
3. 应用会自动将问题填入所有信息源并触发搜索
4. 等待各信息源返回结果

### 切换信息源

每个面板右上角都有一个 **切换按钮**（双向箭头图标），点击后会弹出信息源选择器：

- 选择一个新的信息源来替换当前面板
- 已被其他面板使用的信息源会显示为半透明
- 当前面板的信息源会标记为 "Current"

### 面板全屏

每个面板右上角都有一个 **全屏按钮**（扩展图标），点击后该面板会扩展到占据整个网格区域，方便查看详细内容。再次点击或按 **Escape** 可退出全屏。

### 单独刷新

每个面板右上角都有一个 **刷新按钮**（圆形箭头图标），可以单独刷新该面板的信息源，不影响其他面板。

### 外部链接阅读器

在任意信息源面板中点击外部链接时，3for 会打开一个独立的 **Reader 阅读器窗口**，而不是在当前面板跳转：

- 支持多标签页，可同时打开多个外部链接
- 每个标签页是一个独立的 webview
- 支持复制当前页面链接、用系统默认浏览器打开、页面内查找（Ctrl/Cmd + F）
- 关闭阅读器窗口后，再次点击外部链接会自动重新打开

### 一键新建对话

点击顶部工具栏的 **"为所有 LLM 新建对话"** 按钮，应用会同时为所有 LLM 类型信息源（ChatGPT、Doubao、Kimi、Gemini、Grok）触发新建对话操作，方便在开始新一轮问题前清空上下文。

> **注意**：该按钮只对 LLM 源生效，搜索引擎和社区源不会受影响。

### 缩放控制

- **Ctrl + +** (Windows/Linux) 或 **Cmd + +** (macOS)：放大当前鼠标悬停或键盘聚焦的面板；如果没有任何面板被瞄准，则放大所有面板
- **Ctrl + -** (Windows/Linux) 或 **Cmd + -** (macOS)：缩小当前鼠标悬停或键盘聚焦的面板；如果没有任何面板被瞄准，则缩小所有面板
- **Ctrl + 0** (Windows/Linux) 或 **Cmd + 0** (macOS)：重置当前瞄准面板的缩放；如果没有任何面板被瞄准，则重置所有面板

缩放时右上角会短暂显示当前缩放百分比。

---

## 信息源说明

3for 目前支持 **8 个信息源**，默认显示 4 个，可通过切换按钮自由组合：

| 信息源 | 类型 | 独特价值 | 网址 |
|--------|------|----------|------|
| **ChatGPT** | LLM | 通用推理、逻辑分析、复杂问题深度拆解 | chatgpt.com |
| **Doubao（豆包）** | LLM | 响应最快、中文优化、关联视频教程 | doubao.com |
| **Xiaohongshu（小红书）** | 社区 | 真实用户体验、种草避坑、生活决策参考 | xiaohongshu.com |
| **Kimi** | LLM/搜索 | 长文本处理、深度分析、研究导向 | kimi.moonshot.cn |
| **Metaso（秘塔搜索）** | AI 搜索 | 学术搜索、知识图谱、结构化知识检索 | metaso.cn |
| **Bing** | 搜索引擎 | 广泛网页覆盖、实时新闻资讯、多语言结果 | bing.com |
| **Gemini** | LLM | Google 多模态 AI、实时联网搜索、长上下文理解 | gemini.google.com |
| **Grok** | LLM | xAI 实时搜索、长推理、少过滤响应 | grok.com |

### 推荐组合

- **通用研究**：ChatGPT + Doubao + Kimi + Metaso
- **产品调研**：ChatGPT + Xiaohongshu + Bing + Doubao
- **学术查询**：Kimi + Metaso + Gemini + ChatGPT
- **全面搜索**：ChatGPT + Gemini + Bing + Xiaohongshu
- **多 LLM 对比**：ChatGPT + Doubao + Kimi + Grok

---

## AI 答案总结

3for 内置 AI 综合分析功能，可以自动提取各信息源的内容并生成结构化总结。

### 使用步骤

1. 先在搜索栏中搜索问题，等待各信息源返回结果
2. 点击底部的 **"答案总结 AI"** 栏，展开总结面板
3. 点击 **"生成总结"** 按钮
4. AI 会：
   - 自动提取所有信息源的回答内容
   - 综合分析并生成 **一句话结论**
   - 为每个信息源提取 **独特亮点要点**

### 重新生成总结

如果你不满意当前总结，或者各信息源有了更新的内容，可以随时重新生成：

- **触发栏按钮**：展开总结面板后，触发栏右侧会出现 **"重新生成"** 按钮
- **结果区域按钮**：在总结结果的右上角也有一个 **"重新生成"** 按钮
- **错误重试**：如果总结生成失败，会显示 **"重试"** 按钮

### 总结格式

AI 总结包含两部分：

1. **一句话结论**（紫色高亮区域）：综合所有信息源的核心判断
2. **各来源亮点**（卡片网格）：每个信息源 2-3 个最有价值的要点，突出该来源的独特价值

---

## LLM 设置

3for 支持自定义 LLM 供应商，任何兼容 OpenAI API 格式的服务都可以使用。

### 打开设置

点击顶部工具栏的 **⚙ 设置按钮**，打开 LLM 设置面板。

### 配置项

| 配置项 | 说明 | 示例 |
|--------|------|------|
| **API Base URL** | API 请求地址，支持完整路径或 base URL（程序会自动补全 `/chat/completions`） | `https://api.siliconflow.cn/v1` |
| **API Key** | 你的 API 密钥 | `sk-xxxxxxxxxxxxxxxx` |
| **模型名称** | 使用的模型标识 | `deepseek-chat` |

### 常用供应商快捷设置

设置面板提供了常用供应商的快捷按钮，点击后会自动填入对应的 Base URL 和模型名称：

| 供应商 | Base URL | 默认模型 |
|--------|----------|----------|
| **DeepSeek** | `https://api.deepseek.com/chat/completions` | `deepseek-chat` |
| **通义千问** | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-turbo` |
| **Kimi/Moonshot** | `https://api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k` |
| **硅基流动** | `https://api.siliconflow.cn/v1/chat/completions` | `deepseek-ai/DeepSeek-V4-Flash` |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | `gpt-4o` |

### 使用步骤

1. 点击 ⚙ 设置按钮
2. 点击你要使用的供应商快捷按钮（或手动填写 Base URL 和模型名称）
3. 填入你的 API Key
4. 点击 **"保存设置"**
5. 设置会自动保存，下次生成总结时使用新的 LLM

> **提示**：API Key 保存在项目目录下的 `llm-config.json` 文件中，请妥善保管，不要将此文件分享给他人。

### 获取 API Key

- **DeepSeek**：访问 [platform.deepseek.com](https://platform.deepseek.com/) 注册并创建 API Key
- **通义千问**：访问 [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/) 开通服务
- **Kimi/Moonshot**：访问 [platform.moonshot.cn](https://platform.moonshot.cn/) 注册并创建 API Key
- **OpenAI**：访问 [platform.openai.com](https://platform.openai.com/) 注册并创建 API Key

---

## 快捷键

| 快捷键 | 功能 | 适用平台 |
|--------|------|----------|
| `Enter`（搜索栏内） | 广播搜索到所有信息源 | 全平台 |
| `Ctrl + L` | 聚焦搜索栏 | Windows / Linux |
| `Cmd + L` | 聚焦搜索栏 | macOS |
| `Ctrl + R` | 刷新所有面板 | Windows / Linux |
| `Cmd + R` | 刷新所有面板 | macOS |
| `Ctrl + +` | 放大当前瞄准面板（未命中则放大全部） | Windows / Linux |
| `Cmd + +` | 放大当前瞄准面板（未命中则放大全部） | macOS |
| `Ctrl + -` | 缩小当前瞄准面板（未命中则缩小全部） | Windows / Linux |
| `Cmd + -` | 缩小当前瞄准面板（未命中则缩小全部） | macOS |
| `Ctrl + 0` | 重置当前瞄准面板缩放（未命中则重置全部） | Windows / Linux |
| `Cmd + 0` | 重置当前瞄准面板缩放（未命中则重置全部） | macOS |
| `Escape` | 取消聚焦 / 关闭弹窗 / 退出全屏 | 全平台 |

---

## 常见问题

### Q: 某些信息源加载不出来？

A: 请检查你的网络连接。某些信息源可能需要特定的网络环境才能访问。如果某个源始终无法加载，可以通过切换按钮换成其他可用的信息源。

### Q: 搜索后信息源没有自动输入问题？

A: 自动填充依赖于各网站的页面结构。3for 为 Grok 等已知结构的源维护了特征选择器，但其他源仍依赖位置和可见性启发式。如果某个网站更新了页面，填充脚本可能需要调整。你可以：

1. 等待页面完全加载后再搜索
2. 手动在对应面板中输入问题
3. 查看 DevTools 中的 `[3for]` 日志，确认是否有 `no-input-found` 或异常信息
4. 参考 `doc/问题注入逻辑.md` 了解定位策略

如果某个源长期失效，可以在 issue 中反馈具体的页面变化。

### Q: AI 总结报错 "未配置 API Key"？

A: 请点击右上角 ⚙ 设置按钮，配置你的 LLM 供应商信息和 API Key。默认使用 DeepSeek，你也可以换成其他供应商。

### Q: AI 总结显示 "未检测到有效内容"？

A: 这说明各信息源还没有返回搜索结果。请先搜索问题，等待所有信息源的结果都加载完成后，再点击生成总结。

### Q: 在 Windows 上使用有什么注意事项？

A: 3for 完全兼容 Windows 系统。主要注意：
- 快捷键使用 `Ctrl` 键（而非 macOS 的 `Cmd` 键）
- 字体已针对 Windows 优化（包含微软雅黑）
- 窗口拖拽、缩放等功能在 Windows 上均正常支持
- 如果界面显示异常，尝试更新显卡驱动

### Q: 如何备份登录状态？

A: 登录状态保存在 Electron 的用户数据目录中。备份该目录即可保留所有登录状态：
- **Windows**: `%APPDATA%/3for`
- **macOS**: `~/Library/Application Support/3for`
- **Linux**: `~/.config/3for`

### Q: 应用如何更新？

A: 替换项目目录中的代码文件（main.js、preload.js、src/ 目录）即可。运行 `npm install` 确保依赖是最新的。

---

## 项目结构说明

```
3for/
├── main.js              # Electron 主进程（窗口管理、LLM API 调用）
├── preload.js           # 安全桥接（IPC 通信接口）
├── package.json         # 项目配置
├── llm-config.json      # LLM 供应商配置（自动生成）
├── deepseek-api         # 旧版 DeepSeek API Key（向后兼容，推荐迁移到 llm-config.json）
├── README.md            # 项目介绍
├── USER_GUIDE.md        # 本文件
├── CLAUDE.md            # 项目记忆与交互规则
├── MEMORY.md            # 长期记忆
├── memory/              # 每日记忆
├── doc/                 # 技术文档
│   └── 问题注入逻辑.md
├── logo/                # 各信息源 logo
└── src/
    ├── index.html       # 界面结构
    ├── renderer.js      # 核心逻辑（搜索、填充、总结、UI 交互）
    ├── styles.css       # 样式（暗色主题）
    ├── reader.html      # 外部链接阅读器窗口
    ├── reader.css       # 阅读器样式
    └── reader.js        # 阅读器多标签管理
```

---

*3for v1.3.0 — 一次提问，多源搜寻*
