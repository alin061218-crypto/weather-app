# TASK-015c 全页面视觉巡检

日期：2026-10-03（Asia/Shanghai）

## 检查范围

- 主矩阵：5 个 tab × 375 / 768 / 1280px，共 15 张截图。
- 交互补图：搜索下拉、地图弹窗、聊天对话、桌面导航指示条。
- 截图断言：innerWidth 等于期望值；横向溢出使用 document.body.scrollWidth；未使用 --hide-scrollbars。
- 对比度由 contrast.cjs 计算，结果见 [contrast.txt](./contrast.txt)。

## 必修

- **无。** 当前截图未发现横向溢出、内容裁切、表单列拉伸、指南 tabs 与内容断裂、导航指示条越界或 hero scrim 硬矩形边界。
- 聊天初始态曾有结构性留白：页面 padding 与 header margin 叠加，单条欢迎消息时列表又被 flex 拉到 50vh。已修复为聊天页顶部 0 padding、header 16px 起始间距，消息列表 flex: 0 1 auto; min-height: 0；长对话仍可在 50vh 内滚动。

## 建议

- 地图弹窗补图阻断了 embed.windy.com，故中央地图区域为空只说明证据环境阻断外部 iframe，不代表真实服务不可用；接入真实地图时应补一次允许 iframe 的浏览器验收。
- CDP captureBeyondViewport 对 fixed 元素存在合成覆盖风险；主矩阵截图前临时将导航设为 static，并另存 nav-indicator-1280.png 检查真实 fixed 导航。桌面指示条实测 2×24px，位于按钮左侧 4px 内。
- 聊天长对话 8 条消息在 400px 窄列内正常换行；后续消息量增长保持 50vh 滚动上限即可。
- 已登录收藏/历史是可扫描的数据列表，不是表单控件，因此保留 --width-data 档；登录表单、指南空态和聊天输入区使用 --width-form。

## 逐组结果

| 页面 | 375px | 768px | 1280px | 观察 |
| --- | --- | --- | --- | --- |
| 天气主页 | [home-375.png](./home-375.png) | [home-768.png](./home-768.png) | [home-1280.png](./home-1280.png) | 图表、指标带、7 天指纹对齐；hero 边缘柔和。 |
| 聊天 | [chat-375.png](./chat-375.png) | [chat-768.png](./chat-768.png) | [chat-1280.png](./chat-1280.png) | 窄列居中；初始态不再撑出大块消息空区。 |
| 美食指南 | [guide-food-375.png](./guide-food-375.png) | [guide-food-768.png](./guide-food-768.png) | [guide-food-1280.png](./guide-food-1280.png) | tabs 与列表同宽，无裁切。 |
| 我的·登录 | [me-login-375.png](./me-login-375.png) | [me-login-768.png](./me-login-768.png) | [me-login-1280.png](./me-login-1280.png) | 表单居中，控件填满窄列。 |
| 我的·已登录 | [me-logged-375.png](./me-logged-375.png) | [me-logged-768.png](./me-logged-768.png) | [me-logged-1280.png](./me-logged-1280.png) | 收藏/历史列表按 data 档排列。 |
| 指南·旅行补图 | [guide-travel-375.png](./guide-travel-375.png) | [guide-travel-768.png](./guide-travel-768.png) | [guide-travel-1280.png](./guide-travel-1280.png) | 与美食指南同一宽度策略。 |
| 指南·空态补图 | [guide-empty-375.png](./guide-empty-375.png) | [guide-empty-768.png](./guide-empty-768.png) | [guide-empty-1280.png](./guide-empty-1280.png) | 空态窄列居中。 |

## 交互补图

- [search-dropdown-1280.png](./search-dropdown-1280.png)：结果下拉贴合搜索框，无横向溢出。
- [map-modal-1280.png](./map-modal-1280.png)：遮罩和边界完整，iframe 受阻断。
- [chat-conversation-1280.png](./chat-conversation-1280.png)：气泡、头像、输入行均限制在 400px 窄列。
- [nav-indicator-1280.png](./nav-indicator-1280.png)：fixed 竖向导航指示条未冒出框外。

## 表单宽度实测

- 登录表单：375px 视口 343px；768px 视口 400px；1280px 视口 400px。
- 聊天输入区与消息列：375px 视口 343px；768px 视口 400px；1280px 视口 400px。
- 指南空态：375px 视口 343px；768 / 1280px 视口 400px。
- 已登录收藏/历史列表：375px 视口 343px；768px 视口 720px；1280px 视口 1120px。
