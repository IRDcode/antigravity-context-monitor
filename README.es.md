<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <strong>Español</strong> · <a href="README.fa.md">فارسی</a> · <a href="https://irdcode.github.io/antigravity-context-monitor/">Docs Page</a>
</p>

<p align="center">
  <img src="assets/hero.svg" alt="Antigravity Context Monitor v2.0 — Monitor en tiempo real de ventana de contexto para Google Antigravity Desktop" width="100%">
</p>

# Antigravity Context Monitor

**Monitor en tiempo real de ventana de contexto, guardia de autocompactación (`CHECKPOINT`), desglose de tokens en 7 categorías, telemetría de caché, seguimiento de subagentes aislados y guardia multi-modelo para Google Antigravity Desktop (`v2.0.0`).**

Google Antigravity ejecuta subagentes aislados (`invoke_subagent`) y alterna modelos entre fases en el modo `Orchestrator`, ocultando el medidor de tokens en la interfaz. Sin embargo, guarda el conteo exacto por turno (`input_tokens`, `cache_read_tokens`, `output_tokens`) y los puntos de compactación en `~/.gemini/antigravity/brain/<convId>/.system_generated/logs/transcript.jsonl`.

**`antigravity-context-monitor`** lee únicamente esos archivos locales de forma pasiva y sin llamadas de red, manteniendo tu cuenta 100% segura.

<p align="center">
  <img src="assets/architecture.svg" alt="Arquitectura pasiva de telemetría local en 3 etapas v2.0" width="100%">
</p>

---

## Novedades en v2.0.0 y características principales

- **Compatible con Antigravity Desktop `v2.34.0` (Multi-Anchor):** Soporta `loadHubWindowUrl` (`v2.34.0+`) junto con ganchos anteriores (`v2.32.x`–`v2.33.x`), con actualización automática por huella `SHA-256` mediante `--if-needed`.
- **Conteo exacto de API + Guardia de autocompactación (`CHECKPOINT`):** Calcula el uso activo directamente desde el último `PLANNER_RESPONSE` (`input_tokens + cache_read_tokens + output_tokens`); separa `Compacts` reales (con historial expandible) de `Rewinds` por reintentos de `step_index`, con umbral adaptativo (`~500k` en `1M`, `840k` en `claude-1m_840k`, `85%` en `200k`/`128k`) y alerta configurable (`30–95%`).
- **36 modelos integrados + autodescubrimiento + límites personalizados:** Cubre `GPT-OSS 120B/20B` (`128k`), `Claude 5.5` (`200k`, `Max` y variantes dinámicas `1M`/`840k`), `Gemini 4 Neon/Carbon/Hydrogen/Argon`, `Gemini 3.x` y modos `Orchestrator` (`1M`), descubre modelos nuevos automáticamente y permite editar límites personalizados en **Settings**.
- **Combobox accesible personalizado + sincronización nativa Light/Dark:** Reemplaza por completo `<select>` nativo con un selector ARIA filtrable que nunca se cierra durante el sondeo, se sincroniza con el tema claro/oscuro de Antigravity y muestra `0 / <tier> · Ready` limpiamente en sesiones nuevas (`empty_new`).
- **Desglose en 7 categorías e interfaz dual unificada:** Distribuye el 100% del contexto activo entre `System & Rules`, `MCP Servers & Tools`, `Skills & Plugins`, `Files & Codebase`, `Terminal & Tasks`, `Chat Messages` y `Reasoning & Subagents` tanto en la barra superior (**`Alt+C`** / `⌥C`) como en el panel oficial Sidecar.

---

## Inicio rápido (Windows)

1. Requiere **Node.js `>= 20.0.0`**. Descarga el repositorio y haz doble clic en **`Launch-Antigravity-Context.bat`**.
2. Usa **`Diagnose-Antigravity-Context.bat`** para verificar el estado y **`Restore-Antigravity-Context.bat`** para revertir a la versión original sin tocar tus chats.

## Comandos CLI (Windows, macOS y Linux)

```bash
npm install --omit=dev
npm run doctor
npm run patch
npm run sync
npm run analyze -- --json
npm run restore
npm test
```

## Licencia

**MIT License** — Ver [LICENSE](LICENSE) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
