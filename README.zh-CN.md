<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fa.md">فارسی</a> · <a href="https://irdcode.github.io/antigravity-context-monitor/">Docs Page</a>
</p>

<p align="center">
  <img src="assets/hero.svg" alt="Antigravity Context Monitor — Google Antigravity Desktop 实时上下文窗口监控面板" width="100%">
</p>

# Antigravity Context Monitor

**适用于 Google Antigravity Desktop 的实时会话上下文窗口监控器、7 类 Token 占用明细、Prompt Cache 命中率统计、子智能体隔离追踪与多模型切换防溢出守卫。**

不同于 Claude Code 等单循环终端工具，Google Antigravity 在 `Orchestrator` 模式下会在规划模型与执行模型之间切换，并通过 `invoke_subagent` 在独立子会话中执行检索和浏览器任务，同时在界面上隐藏了底层 Token 计数器。但 Antigravity 会在本地会话日志（`~/.gemini/antigravity/brain/<convId>/.system_generated/logs/transcript.jsonl`）中精确记录每一步的 `input_tokens`、`cache_read_tokens` 和 `output_tokens`。

**`antigravity-context-monitor`** 以完全只读、零网络请求的方式读取这些本地日志，在不篡改请求、不接触账号令牌的前提下提供原生的上下文监控视图。

<p align="center">
  <img src="assets/architecture.svg" alt="三阶段离线只读遥测架构图" width="100%">
</p>

---

## 核心特性

- **真实 API Token 计数：** 直接读取最新 `PLANNER_RESPONSE` 的 `input_tokens + cache_read_tokens + output_tokens`，告别字符估算误差。
- **完整覆盖 18 个官方模型与真实窗口上限：**
  - **GPT-OSS（`128k` 上限 / `80k` 注意力甜点）：** `gpt-oss-120b-medium`
  - **Claude 5.5（`200k` 上限 / `120k` 注意力甜点）：** `claude-opus-5-5-{high,medium,low}`、`claude-sonnet-5-5-{high,medium,low}`
  - **Gemini 3.8 / 4 与 Orchestrator（`1M` 上限 / `150k` 注意力甜点）：** `gemini-3.8-flash-*`、`gemini-4-argon-*`、`gemini-4-hydrogen-*`、`gemini-pro-orchestrator-g1-pro`
- **多模型切换与阶段守卫：** 仅解析 `USER_INPUT` 中真正的 `<USER_SETTINGS_CHANGE>` 模型变更（免疫工具输出中的干扰字符串），追踪 `exit_plan_mode` / `[plan review]` 阶段切换，并在当前上下文超出 `128k` 或 `200k` 较窄模型上限时发出溢出预警。
- **7 类 Token 构成占比（严格对齐 100% 总量）：** 拆分展示 `System & Rules`、`MCP Servers & Tools`、`Skills & Plugins`、`Files & Codebase`、`Terminal & Tasks`、`Chat Messages` 与 `Reasoning & Subagents`，支持日志轮转窗口与 `/compact` 压缩检测。
- **双端原生展示：** 顶部标题栏实时胶囊 + 弹出面板（快捷键 **`Alt+C`** / `⌥C`）以及官方 `sidecar_sdk` 侧边扩展面板。

---

## 快速开始（Windows）

1. 下载并解压到固定目录（例如 `C:\Tools\antigravity-context-monitor`），需预先安装 **Node.js `>= 20.0.0`**。
2. 双击 **`Launch-Antigravity-Context.bat`**：首次运行自动安装 `@electron/asar`、创建未修改备份 `app.asar.bak`、注入监控面板并同步 Sidecar 插件至 `~/.gemini/config/plugins/context-monitor`，随后启动 `Antigravity.exe`。
3. 官方更新覆盖 `app.asar` 后，再次通过 `Launch-Antigravity-Context.bat` 启动即可自动重新应用。
4. 使用 **`Diagnose-Antigravity-Context.bat`** 进行无损健康诊断，使用 **`Restore-Antigravity-Context.bat`** 一键还原官方原版。

---

## 命令行用法（Windows / macOS / Linux）

```bash
npm install --omit=dev
npm run doctor                 # 无损健康检查
npm run patch                  # 应用补丁并同步 Sidecar 插件
npm run sync                   # 仅同步 Sidecar 开发文件，不修改 app.asar
npm run analyze -- --json      # 在终端输出当前会话上下文 JSON 报告
npm run restore                # 安全还原 app.asar
npm test                       # 运行完整测试套件
```

## 开源许可

基于 **MIT License** 开源 — 详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
