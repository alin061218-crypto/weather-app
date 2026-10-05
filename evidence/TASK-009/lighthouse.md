# Lighthouse 实测（无豁免）

验收日期：2026-10-06（Asia/Shanghai）。

本次尝试并成功执行：

```powershell
npm exec --yes --package=lighthouse -- lighthouse --version
# 13.5.0
node evidence/TASK-009/lighthouse.cjs
# Lighthouse 13.5.0: Accessibility 98/100; 1 failed audits
```

与 TASK-008 使用 `npx --no-install` 的情况不同，本次显式允许 npm 下载，成功装入临时 npm exec 缓存。未把 Lighthouse 加入生产依赖或项目 devDependencies。

使用独立临时 Chrome 配置，通过 CDP 连接到浏览器；1280×1100、desktop、浅色 clear-day 首页、完整天气夹具。Lighthouse 的导航审计会真正加载生产 HTML/CSS/JS，天气及定位请求由同类 API 夹具替换，保留浏览器默认规则。

**Accessibility：98/100，满足 ≥95；无运行警告。** 唯一失败项目为 `heading-order`，生活指数组直接出现 h3，属于 moderate / best-practice；修法和本次不修改 HTML 的理由见 `violations.md`。

完整原始报告：`lighthouse.json`；可视报告：`lighthouse.html`；精简摘要：`lighthouse-summary.json`。
此分数属于以上代表状态，不冒充三档、所有状态或第三方 iframe 的 Lighthouse 全覆盖；三档要求由 42 次 axe 审计完成。
