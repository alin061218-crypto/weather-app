# 违规清单与处理判定

最终 axe 的 violations：critical 0、serious 0、minor 0；moderate 共 5 类。每次审计及所有节点保存在 `axe-summary.json` 和对应原始 JSON。本清单按问题归并，不把同一问题在不同宽度重复计为新问题。

## 必修：已完成

| 问题与来源 | 修复前 | 修法与复测 |
| --- | --- | --- |
| color-contrast / serious：浅色 `.day-precip`，7 行降水百分比 | primary 对 surface-card 为 4.10:1，小字号要求 4.5:1 | 仅浅色改用现有 ink-secondary；7.27:1，行 hover 的 surface-hover 上 6.50:1 |
| color-contrast / serious：浅色选中 `.tab-btn-label` | primary 对 surface-raised 为 3.99:1 | 仅浅色选中标签改用 ink-secondary，7.07:1；图标和选中指示条继续使用 primary |
| color-contrast / serious：浅色隐私弹窗内两个链接 | primary 对 surface-raised 为 3.99:1 | 仅浅色 `.content-dialog a` 改用 ink-secondary，7.07:1；原有链接下划线保持可辨识 |
| color-contrast / incomplete 的人工复核：`#clear-recent` | muted 文字又乘 opacity 0.6；在 clear-day CSS 基底上，深色 3.64:1、浅色 2.46:1 | `.recent-clear` opacity 改为 1；每个场景及两套主题均新增有效文字合成检查，最低 5.45:1。此计算验证 CSS 基底，不冒充完整 3D 图像合成的逐像素检测 |

四处均为有意义的界面文字，不能以装饰元素理由豁免。生产修改仅限这四处 CSS；未重做已有 ARIA、温度按钮键盘交互或 reduced-motion。

## 建议：逐项修法与本次不必修理由

这些结果均保留，没有为获得 0 违规而修改审计规则。五类均标记为 moderate / best-practice，属于结构改进；本次验收要求为 0 critical / serious，写作用域也不包含 HTML/JS 结构变更。

| axe 规则 | 出现位置与范围 | 建议修法 | 本次不必修理由 |
| --- | --- | --- | --- |
| heading-order | home / map：生活指数首个 h3，12 次 | 给指数组添加有意义的 h2，再保留各指数 h3；或按整体页面结构调整各指数为 h2 | 标题层级跳跃；实际标题和内容可读取，属结构建议。Lighthouse 唯一扣分项也是它 |
| landmark-unique | home / map：`#recent-section` 与 `.tab-bar` 同为无名称 navigation，12 次 | 为两个真实导航分别提供“最近城市”“应用导航”的可访问名称 | 两处导航可操作且内容可读；名称区分是改进，不应给背景添加 navigation 等角色 |
| landmark-one-main | chat / guide / me，18 次 | 用语义 main 承载当前活动页；避免多个可见 main，并避免嵌套已有天气 main | 当前只有天气页 main；其他页内容仍可通过控件或标题读取，main 快捷导航待完善 |
| page-has-heading-one | chat / guide / me，18 次 | 将各活动页的真实页面标题建立为 h1（必要时用可见标题替换现有 span/h2） | 缺少活动页 h1 是页面结构建议，不能靠 CSS 假造语义 |
| region：真实内容 | chat：`.chat-header > span`、`.chat-text`、`#chat-input`；guide：`#food-guide`；me / feedback / privacy：账号标题、说明、用户名/密码输入框与 `.me-switch` | 与 main 改进一并收纳真实内容；弹窗外 inert 背景内容应由真实语义 main 处理，不为每个节点乱加 region | 内容与输入已有可读文字或名称；地标覆盖属于结构改进。原始结果也保留了原生模态弹窗背景上的这些节点 |
| region：装饰背景 | `#atmosphere`，42 次；region 共 156 个节点实例 | **判定不修** | HTML 明确标为 Three.js 背景；容器无文字、无可聚焦控件、pointer-events:none，见 manual-review JSON。它不承载业务信息，不应为清零给它加 main/region 等 ARIA |

## incomplete：人工复核与限制

incomplete 是工具无法自动定论，不能当作“已通过”，也不计入 violations 的 critical/serious 数量。以下逐项保留。

| 规则 / 节点 | 判定与依据 | 修法或后续建议 |
| --- | --- | --- |
| aria-prohibited-attr / `#life-indices` | 普通 div 的 aria-label 无合适语义角色，标签可能被忽略；它不是装饰内容。指数标题和正文实际存在且可读取，见 manual-review JSON | **建议**删除该无效标签，或在真实指数组上用语义 section + 可见 h2/aria-labelledby 建立名称；本次不在 CSS 任务中新增 ARIA |
| aria-valid-attr-value / `#map-btn`、`#feedback-open`、隐私入口 | 工具无法确定关闭状态的隐藏 dialog ID；引用分别指向真实 map-modal / feedback-dialog / privacy-dialog。三类弹窗均真实打开后审计，map 关闭还核对了引用 | **判定不修**。关闭的 dialog 不可见属于正常行为；不能删掉正确 aria-controls 来清空 incomplete |
| color-contrast / `.theme-contrast-icon` | aria-hidden=true，只有 ◐ 图形，不是文本；所属按钮已有准确 aria-label | **判定不修**。应按图标非文字对比度判断，不加朗读内容 |
| color-contrast / `#feedback-close`、`#privacy-close` | 单字符 × 被标为无法判断文本；所属关闭按钮有完整 aria-label | **判定不修**。× 是关闭图标，现有文字名称明确，不添加冗余 ARIA |
| color-contrast / `#clear-recent` | 3D 图像妨碍自动背景判断；人工发现文字透明度实质失败 | **必修已完成**，详见上表；原始 incomplete 仍保留 |
| color-contrast / Hero、统计格、chat 输入、指南内容、账号内容、部分弹窗段落 | 伪元素、图像或重叠区域导致背景不能自动确定。48 项 CSS 场景文字矩阵及修复后的局部色板已通过；这并不证明所有 3D/渐变合成像素都满足比值 | **建议**对不同动画帧和复杂背景继续作合成/人工复核；不移除视觉背景、不把有意义的文字标为 aria-hidden，也不宣称 incomplete 已全通过 |
| bypass / html | guide 状态工具无法确定有效跳过链接/标题/地标，和上述 main、h1 改进关联 | **建议**增加真实主区/标题，必要时提供可见于键盘焦点的跳转主内容链接；不是本次 critical/serious 违规 |
| frame-tested / iframe | Windy 地图 iframe 是离线夹具，占位页不代表线上第三方地图内容 | **建议**在线单独审计第三方 iframe；本次仅证明外层对话框，不声称第三方内容符合 WCAG |

额外操作观察：地图关闭按钮的鼠标点击可能被 iframe 覆盖。此次地图审计通过已存在的 Escape 关闭，未用 force click 绕过。建议另行调整 map 关闭按钮的堆叠顺序并补鼠标复测；这不是 axe 报出的必修项，所以没有超出用户限定的 CSS 写作用域修改它。
