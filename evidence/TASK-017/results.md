# TASK-017 验收记录

验收日期：2026-10-03（Asia/Shanghai）。修改范围仅 `server.js` 与 `evidence/TASK-017/`。

## 8 条交付

1. **P1-23**：使用 `history.slice(0, 30)`，保持数据库的 `time DESC` 顺序。插入恰好 40 条时间递增记录后，实际 DOM 中 30 行为 `回归城市39 … 回归城市10`。
2. **LIMIT 与真实总数**：`userAll / favAll / histAll` 分别限制 50 / 50 / 100。指标及表标题使用 `/admin/api/stats` 的 COUNT(*)，不使用数组长度。70 用户、85 收藏、392 历史、7 缓存的测试库中，指标仍为 70 / 85 / 392 / 7；overview 返回 50 / 50 / 100 行，历史表显示 30 行。
3. **5 个索引**：启动后通过 SQLite 的 `index_list` 与 `index_info` 验证名称及列：history.city / time / userId、favorites.userId / admin1。均使用 `CREATE INDEX IF NOT EXISTS`。
4. **stats API**：`adminAuth` 保护；四个 counts 全部 COUNT(*)，byCity / byDay / byProvince 为 10 / 14 / 10 行。聚合结果逐项与 fixture 数据独立计算的分组结果比较；日期返回倒序，前端复制后 reverse，图表顺序为 09-20 → 10-03。
5. **设计规格**：内联镜像 token 使用任务指定的七个值与同步注释；4 项等分、上下 1px 发丝线，无外框、圆角或阴影。两个 canvas 独立手绘：折线带 alpha 0.10 面积，城市条仅用 --primary，城市名及数字以 DOM textContent 显示。无 Web Font、图表库或外部样式。三个真 table 均含 scope="col" 和真实总数。清缓存移至底部危险区，保留 confirm。顶栏刷新与退出登录可用；新增退出路由撤销 token 并清除 HttpOnly cookie。
6. **TASK-003 XSS 回归**：保留固定模板及原注释，源文件 innerHTML 为 0 命中。普通用户通过真实 API 写入收藏 / 历史恶意字符串，并模拟旧库恶意用户名；表格、输入框与城市图表标签仅显示文字。注入元素 0、执行 payload 0；返回 HTML 不含数据库值或密码哈希。用户名修改、三种删除操作继续正常刷新指标。
7. **登录页**：同一套镜像 token、系统字体、真实表单 label、2px focus-visible 焦点环；375px 登录、进入后台、退出均经过浏览器验证。附 `login-375.png`。
8. **响应式**：375 / 768 / 1280 均验证 innerWidth 精确相等，且 `document.body.scrollWidth <= document.documentElement.clientWidth + 1`。页面无 overflow-x:hidden；表格在自身区域滚动。两个图表有 role="img" 与中文 aria-label，趋势文字汇总和城市次数均验证；键盘 Tab 到刷新按钮显示 2px solid / offset 2px 焦点环。

## 验收输出

完整输出见 `stats.txt`、`screenshots.txt`、`checks.txt`，浏览器指标见 `screenshots.json`。

```text
PASS: real COUNT(*) totals = {"users":70,"favorites":85,"history":392,"cache":7}
PASS: overview row counts = 50 / 50 / 100; no password column
PASS: byCity=10, byDay=14 (DESC), byProvince=10
PASS: SQLite contains all 5 required indexes
PASS: source acceptance counts = {"oldHistorySlice":0,"limitedQueries":3,"indexes":5,"statsReferences":2,"oldColors":0,"innerHTML":0}
PASS: P1-23 / 40 increasing history rows → 30 visible, newest first (39 … 10)
PASS: stored-XSS regression; 0 injected elements / 0 executed payloads
PASS: CRUD / clear-cache confirm cancel and accept / empty database / logout
PASS: 0 browser errors
```

| 截图 | innerWidth | body.scrollWidth | clientWidth | PNG 尺寸 |
|---|---:|---:|---:|---|
| admin-375.png | 375 | 360 | 360 | 375 × 2398 |
| admin-768.png | 768 | 753 | 753 | 768 × 2007 |
| admin-1280.png | 1280 | 1265 | 1265 | 1280 × 2007 |

截图脚本显式从 Playwright 默认启动参数中移除隐藏滚动条开关；浏览器保留 15px 滚动条占位。使用 CDP 捕获整页与该占位，额外断言 PNG 宽度等于档位、高度等于整页高度。三张截图已目视检查。

## 复现

在仓库根目录执行：

```powershell
node evidence/TASK-017/stats.cjs
node evidence/TASK-017/screenshots.cjs
node --check server.js
git diff --check
```

脚本启动真实 server.js，使用系统临时目录中的独立 SQLite 库和随机测试凭据，完成后关闭服务并清理临时库。截图数据为测试数据；未使用现有服务或现有数据库。截图脚本使用现有 Edge 和 bundled Playwright；其他环境可设置 `EDGE_PATH`、`PLAYWRIGHT_PATH`。

颜色以 TASK-017 及本次用户指定值为准；当前 style.css 的 --ink / --ink-secondary / --border 与任务规格不同，本次未改动该文件。
