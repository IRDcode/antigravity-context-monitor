<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>日本語</strong> · <a href="README.es.md">Español</a> · <a href="README.fa.md">فارسی</a> · <a href="https://irdcode.github.io/antigravity-context-monitor/">Docs Page</a>
</p>

<p align="center">
  <img src="assets/hero.svg" alt="Antigravity Context Monitor — Google Antigravity Desktop 用リアルタイムコンテキストモニター" width="100%">
</p>

# Antigravity Context Monitor

**Google Antigravity Desktop 向けのリアルタイムコンテキストウィンドウ監視、7カテゴリ別トークン内訳、Prompt Cache 可視化、Subagent 分離追跡、およびマルチモデル切り替えガード。**

Google Antigravity は `Orchestrator` モードで Planning / Execution モデルを切り替え、`invoke_subagent` により重い処理を子セッションへ分離する非同期アーキテクチャを採用しているため、UI 上に生のトークン残量が表示されません。しかしローカルのセッションログ（`~/.gemini/antigravity/brain/<convId>/.system_generated/logs/transcript.jsonl`）には正確な `input_tokens`・`cache_read_tokens`・`output_tokens` が毎ターン記録されています。

**`antigravity-context-monitor`** はネットワーク通信を一切行わずローカルログを読み取るだけで、アカウントの安全性を保ったまま高精度なコンテキスト監視を提供します。

<p align="center">
  <img src="assets/architecture.svg" alt="3段階の完全オフライン読み取り専用テレメトリ構成" width="100%">
</p>

---

## 主な機能

- **正確な API 実測ベース:** 最新の `PLANNER_RESPONSE`（`input_tokens + cache_read_tokens + output_tokens`）から実使用量を算出します。
- **全18公式モデルと上限の正確な識別:** `GPT-OSS`（`128k`）、`Claude 5.5`（`200k`）、`Gemini 3.8 / 4` および `Orchestrator`（`1M`）の上限と推奨集中ライン（`80k` / `120k` / `150k`）を厳密に区別します。
- **マルチモデル切り替え・フェーズ監視:** `USER_INPUT` 内の `<USER_SETTINGS_CHANGE>` のみを検出し（ツール出力内の文字列誤認識を防止）、`exit_plan_mode` によるフェーズ移行や `128k` / `200k` 超過時のオーバーフロー警告を表示します。
- **7カテゴリ別トークン内訳:** `System & Rules`、`MCP Servers & Tools`、`Skills & Plugins`、`Files & Codebase`、`Terminal & Tasks`、`Chat Messages`、`Reasoning & Subagents` へ合計 100% 一致するよう配分します。
- **2つのUI:** タイトルバー常駐メーター（**`Alt+C`** / `⌥C`）および公式 `sidecar_sdk` によるサイドパネル拡張。

---

## クイックスタート (Windows)

1. 本リポジトリをダウンロードし、**Node.js `>= 20.0.0`** が導入された環境で **`Launch-Antigravity-Context.bat`** を実行します。
2. **`Diagnose-Antigravity-Context.bat`** でヘルスチェック、**`Restore-Antigravity-Context.bat`** で純正状態への完全復元が可能です。

## CLI コマンド (Windows / macOS / Linux)

```bash
npm install --omit=dev
npm run doctor                 # 非破壊ヘルスチェック
npm run patch                  # app.asar パッチ適用 + Sidecar 同期
npm run sync                   # Sidecar ファイルの即時同期
npm run analyze -- --json      # CLI 上でコンテキスト解析結果を出力
npm run restore                # 純正状態へ復元
npm test                       # 自動テストの実行
```

## ライセンス

**MIT License** — [LICENSE](LICENSE) および [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
