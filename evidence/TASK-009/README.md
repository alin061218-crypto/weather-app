# TASK-009：场景覆盖与可访问性审计

验收日期：2026-10-06（Asia/Shanghai）。本次仅完成修订后的三项；原四项不重复实施。

## 场景覆盖

`contrast-common.cjs` 从实际 `frontend/css/style.css` 解析选择器及颜色，所有六个 `contrast.cjs` 共用它。无颜色常量兜底，遇到缺色、重复场景、不能解析的场景覆盖规则立即失败。

| 脚本 | 修复前 | 修复后 |
| --- | --- | --- |
| TASK-019 | 写死 7 项，漏 overcast，仅测浅色正文/次级/muted | CSS 派生 8 项，深浅完整矩阵 |
| TASK-015 | 写死 7 项及旧颜色兜底 | CSS 派生 8 项，无旧颜色兜底 |
| TASK-015c、TASK-016c | 写死 8 项及颜色，含已失效的浅色夜景 | CSS 派生 8 项，读取现有统一浅色覆盖 |
| TASK-015e | 已从 CSS 取 8 项，但无覆盖数量断言，仍引用已删除的浅色夜景规则 | 增加覆盖断言，移除失效引用，完整矩阵 |
| TASK-016a | 仅两套固定示例颜色，未随场景变化 | CSS 派生 8 项；同时核对实际 visuals.js 的轴文字令牌和字号 |

当前数量：**8 个场景 = 9 条天气色板规则 − 1 条统一浅色覆盖**。
选择器派生结果为 clear-day、clear-night、cloudy、overcast、rain、snow、fog、storm。
`body[data-weather] { --ink: var(...); ... }` 仅映射文字变量，不定义场景色板，计数不含这条别名规则。因此不是把全文件所有包含该子串的规则机械计数。

每份脚本运行 48 项正文/次级/muted 检查（8 × 2 × 3，阈值 4.5:1），另检查焦点环、主按钮及清除按钮透明度合成后的文字。正文矩阵最低 **5.45:1**。
新结果统一保存在本目录 `contrast-TASK-*.json/.txt`；旧任务目录中原结果保留为历史证据。

`coverage.cjs` 的内存变异验证确认：增加新场景会自动进入列表并增加期望数量；重复场景、缺失颜色和未支持的主题例外会失败；注释不计数。不会修改生产 CSS。

## axe

axe-core **4.13.0** 仅加入 devDependencies，同时更新 npm lockfile。通过 CDP 的 `Runtime.evaluate` 注入完整 axe 源码，再调用不禁用任何规则的 `axe.run(document, ...)`。

审计矩阵：375 / 768 / 1280 × 深色/浅色 × home / chat / guide / me / feedback / privacy / map，共 **42 次**；高度 1100，代表天气 clear-day，未登录且有最近城市。既有 TASK-015e 浏览器夹具设置 `prefers-reduced-motion: reduce`；每次还等待有限的页面动画和样式过渡结束。直接服务生产 HTML/CSS/JS，只替换天气/定位/账号等 API 响应；Windy iframe 是离线占位，不代表第三方地图内容已审计。

最终每次均 **0 critical / 0 serious**，保留全部 moderate 违规和 incomplete 人工复核结果；没有禁用规则、排除装饰容器或注入修饰 ARIA。

- `axe-{width}-{theme}-{state}.json`：42 份完整原始结果，含 violations / incomplete / passes / inapplicable。
- `axe-summary.json`：各档计数、逐节点违规与人工复核清单。
- `violations.md`：必修/建议及不必修的逐项判定和修法。
- `axe-before-375-light-home.json`、`axe-before-375-light-privacy.json`：修复前代表结果。
- `manual-review-*.json`：弹窗引用存在、生活指数实际文本、3D 容器无文字/无焦点/不接收指针的复核。
- `recent-clear-before.json`：原 0.6 透明度的 CSS 基底合成分析。

## Lighthouse 与复现

见 `lighthouse.md`：本次成功安装到 npm 临时缓存并实测，Accessibility **98/100**，不需要豁免。

```powershell
cd E:\weather\weather-project
npm ci
node evidence/TASK-009/verify.cjs
Select-String -Path evidence\TASK-019\contrast.cjs,evidence\TASK-015e\contrast.cjs -Pattern "const scenes = \['"
npm exec --yes --package=lighthouse -- lighthouse --version
node evidence/TASK-009/lighthouse.cjs
```

浏览器脚本沿用现有本机 Playwright/Edge 路径；迁移环境可设置 `PLAYWRIGHT_PATH` 和 `EDGE_PATH`。可选 Lighthouse 支持 `LIGHTHOUSE_PATH`、`CHROME_PATH`，默认从本机 npm exec 缓存查找。
`checks.txt` 保存六份对比度脚本、覆盖变异检查、axe、版本检查、证据静态检查、npm test 和 diff 空白检查的原始输出与退出码。
