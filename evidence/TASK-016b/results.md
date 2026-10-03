# TASK-016b 验收记录

2026-10-03，工作仓库 `E:\weather\weather-project`。新版规格：9 个关注点模块，main.js ≤250 行，保持行为与视觉。

## 提交与回退

- 干净基线：`e6e8dc0`（工作区原本干净，建立空基线提交）。
- 第一批 config / ui / api：`817e118`，提交后完整回归通过。
- 第二批 cities / visuals / account：`78c00d4`，提交后完整回归通过。
- 第三批 render / search / chat：`a0aaeb8`，提交后完整回归通过。
- 第一批的两个初次尝试因遗漏 `$` 导出、遗漏旧 atmosphere 引用而失败，分别用 `648046d`、`89b6de9` 回退；修复后重新提交，没有保留失败实现。

每批回归均包括后端/兜底指纹、三档键盘操作、竞速取消、后端定位、冷启动、三档完整截图；日志与截图分别在 baseline、batch-1、batch-2、final 目录。

## 数量的修订歧义

职责表明确列出 9 个新模块，加 main.js 和既有 icons.js / atmosphere.js，真实总数是 **12**，不是文档数量注释中的 10。

因此，importmap 的 `app/*` 条目为 **12**，与 frontend/js 文件数完全一致；另保留既有 Three.js vendor 映射 `three`，imports 对象总键数为 **13**。版本守卫验证全部 URL（也验证 CSS 和 vendor），输出计数按唯一应用 JS 文件为 **12**，不重复计算 main script。

## 六项结果

完整原始输出：`acceptance.txt`。

| 文件 | PowerShell Measure-Object -Line | 实际文本行 | export 数 |
|---|---:|---:|---:|
| account.js | 203 | 224 | 15 |
| api.js | 121 | 129 | 6 |
| atmosphere.js | 403 | 444 | 1 |
| chat.js | 101 | 115 | 2 |
| cities.js | 115 | 121 | 8 |
| config.js | 61 | 68 | 9 |
| icons.js | 139 | 154 | 3 |
| main.js | 130 | 144 | 3 |
| render.js | 212 | 236 | 5 |
| search.js | 196 | 209 | 4 |
| ui.js | 62 | 71 | 10 |
| visuals.js | 192 | 212 | 6 |

1. 12 文件；main.js 实际 144 行；9 个新模块均在 30–350 行内；所有文件有 export，无 <30 行碎片。既有 atmosphere.js / icons.js 字节未变。
2. `imports.cjs`：12 模块为 DAG、无动态 import、仅裸标识符、符合允许依赖方向；还使用 Node 的真实 ESM linker 验证所有命名导出，全部通过。
3. `importmap.cjs`：12 app 条目覆盖 12 文件；每个哈希等于 SHA-1[:8]；模板及所有 JS 内无手写 ?v=；缺映射/错哈希被拒绝；只改子模块会自动刷新其 URL。服务端响应快照见 `rendered-index.html`。
4. `npm run check:versions`：`PASS: 12 index asset versions match SHA-1 content hashes`。
5. 完整回归：后端/兜底均为 24 点、7 行、每行 24 根指纹；375/768/1280 键盘主流程与扩展控件通过；两种竞速测试均取消慢后端，后端定位成功时直连定位 0 次；常见场景 **256ms ≤700ms**，慢后端 **641ms**，常见场景直连天气 0 次。全部日志在 `final/regression.txt`。
6. 12 个 JS 的 `node --check`、工作区及相对基线的 `git diff --check` 全部通过；HTML 只改 importmap，module script 行字节保持；server.js 在哈希注入区之外的内容不变；sw.js 字节不变；写入均在授权范围。

## 额外的行为和视觉验证

`parity.cjs` 在真实 Edge 中分别加载基线与当前代码，使用相同数据，比较三档暗色/浅色：每档 **566 个元素**的 DOM、完整计算样式、图表 canvas 像素、hero 无边框/阴影、导航焦点环与完整 PNG 均完全相同。

为了消除拍摄时刻噪声，仅在验收响应中固定随机种子与 Three.js 相机位置；生产 atmosphere.js 没有修改。标准 `final/*.png` 截图加载未经替换的真实生产视觉代码。

还比较了 6 类聊天回复、义乌区县指南、注册/登录/登出、未登录收藏导航、收藏提交仅一次、从收藏与历史选城、删除收藏与清空历史，基线与当前行为一致。数据见 `parity-final/results.json`。

`cache.cjs` 启动真实 server.js，逐个核对 12 模块 HTTP 内容哈希和 `public, max-age=31536000, immutable`；随后以未禁用 HTTP 缓存的真实浏览器加载、修改 config.js、刷新，确认 main.js 的哈希不变且 **确实来自浏览器缓存**，新 config 通过自动更新的 importmap 执行。所有临时修改最终恢复。数据见 `cache.json`。

## 可复跑命令与历史脚本适配

```powershell
node evidence/TASK-016b/imports.cjs
node evidence/TASK-016b/importmap.cjs
npm run check:versions
node evidence/TASK-016b/regression.cjs rerun.tmp
node evidence/TASK-016b/parity.cjs parity-rerun.tmp
node evidence/TASK-016b/cache.cjs
node evidence/TASK-016b/acceptance.cjs
```

016c 原脚本仍用已经移除的 `js/main.js?v=13` 定位 bootstrap，并假设竞速两路必定都发出请求；这与 018b 的 150ms hedge 不符。015e/browser.cjs 是辅助库，其键盘驱动是 keyboard.cjs。`preload.cjs` 只在内存中适配旧 bootstrap、按 018b 校正请求数并重定向证据输出；不会修改历史脚本，也不会修改生产代码。regression.cjs 执行所有指定脚本并实际执行 keyboard.cjs。

单独重跑旧指纹脚本需要：

```powershell
node --require ./evidence/TASK-016b/preload.cjs evidence/TASK-016c/fingerprint.cjs
node --require ./evidence/TASK-016b/preload.cjs evidence/TASK-016c/fingerprint.cjs --via-fallback
```

新环境若使用 Windows PowerShell 的默认脚本策略阻止 npm.ps1，可直接使用 `npm.cmd run check:versions`；acceptance.cjs 使用 npm.cmd，不改机器执行策略。
