# TASK-016d：晴夜图标参考图更新

## 当前决策（2026-10-18）

作者本轮提供参考图，要求将晴夜图标改为**实心月牙 + 右上大小两颗四芒星**。此决定取代 2026-10-06 “晴夜共用太阳”的方案 A；旧验收记录在 `evidence/TASK-016d/history-2026-10-06/`。

- 月牙和双星是闭合 SVG 路径，使用 `fill="currentColor"`、`stroke="none"`，不加透明度。
- `clearDay()` 继续使用太阳；夜间天气码 0、1 继续使用 `clearNight()`。
- 不改 `weatherScene()`；`weatherScene(0, false)` 仍为 `clear-night`，夜间背景、3D 月亮、星空、文字和 scrim 沿用原场景。
- 天气 UI 文字仍然显示“晴”。旧方案“夜间显示太阳”及“太阳图标配夜空/月亮背景”两项代价不再适用于当前实现。
- 参考源图、单图预览、三档图标家族截图和可重跑证据在 `evidence/TASK-016d/`。

## 实现与验证

1. `frontend/js/icons.js`：仅将 `clearNight()` 改为参考图对应的实心月牙双星图标。
2. `node evidence/TASK-016d/night-icon.cjs`：断言夜间图标是独立实心月牙和双星，昼夜映射正确，夜间场景仍为 `clear-night`；预期退出码 0。
3. `node evidence/TASK-016d/night-icon.cjs --counterexample`：临时将真实源文件改回白天太阳，执行同一守卫；预期断言失败、退出码 1，随后必须按原始字节恢复文件。实际输出留在 `evidence/TASK-016d/counterexample.txt`。
4. `node evidence/TASK-016d/screenshots.cjs`：重新生成 `icons-24.png`、`icons-48.png`、`icons-hero.png` 三档截图，保留“晴”和“晴夜”两格；另生成 `night-icon-preview.png`。
5. 浏览器检查 SVG 实际填充和描边样式、图标轮廓在 24×24 viewBox 内，并确认截图无浏览器错误。
6. 回归运行：`npm test`、`npm run lint`、`npm run format:check`、`npm run check:versions`、`npm run check:evidence -- --static-only`、`node --check server.js`、`git diff --check`。

## 历史记录

2026-10-06 作者选择放弃月牙，改用太阳，以避免当时的月牙读作字母「C」。2026-10-18 作者另行给出具体月牙双星参考图并要求采用，因此后来的明确决定优先。新选择如实按参考实现；本文不声称它能自动消除任何阅读者的「C」联想。完整旧决定、旧断言和旧方案截图保存在 `evidence/TASK-016d/history-2026-10-06/`，旧几何脚本 `icon-geometry.cjs` 和统一性脚本 `icon-unification.cjs` 不作为当前守卫。
