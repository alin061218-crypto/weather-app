# Weather API 文档

版本：TASK-011（2026-10-03）。本文档按 `server.js` 当前实际注册的 `app.get`、`app.post`、`app.put`、`app.delete` 路由逐条核对；服务启动 banner 以本文档为准。除特别说明外，JSON 接口使用 `Content-Type: application/json`。

## 鉴权约定

- **公开**：不需要登录。
- **登录用户**：请求头 `Authorization: Bearer <JWT>`。JWT 使用 HS256、`weather-app` issuer、`weather-frontend` audience；缺失、过期、篡改或用户已删除均返回 `401`。
- **管理员**：管理员登录返回 token，也会设置 `admin_token` HttpOnly cookie。后台 API 接受 `Authorization: Bearer <token>` 或该 cookie，token 在服务进程内有效 1 小时。无 token 或无效 token 返回 `401`。
- “需登录”表示必须存在登录用户或管理员身份；公开接口仍可能有输入校验或限流。

## 路由清单

| 方法   | 路径                      | 参数                                           | 成功返回                              | 错误码        | 鉴权        | 需登录                 |
| ------ | ------------------------- | ---------------------------------------------- | ------------------------------------- | ------------- | ----------- | ---------------------- |
| GET    | `/`、`/index.html`        | 无                                             | 带内容哈希资源版本的 HTML             | 500           | 否          | 否                     |
| GET    | `/vendor/three.module.js` | `v` 可选；`Accept-Encoding: gzip` 可启用预压缩 | JavaScript 文件                       | 404           | 否          | 否                     |
| POST   | `/api/register`           | JSON `username`、`password`                    | `200 { token, user }`                 | 400、429      | 否          | 否                     |
| POST   | `/api/login`              | JSON `username`、`password`                    | `200 { token, user }`                 | 400、429      | 否          | 否                     |
| GET    | `/api/wx-params`          | 无                                             | `200` 文本天气参数串                  | —（仅 200）   | 否          | 否                     |
| GET    | `/api/weather`            | 查询 `lat`、`lon`                              | Open-Meteo 天气 JSON                  | 400、500      | 否          | 否                     |
| GET    | `/api/air`                | 查询 `lat`、`lon`                              | Open-Meteo 空气质量 JSON              | 400、502      | 否          | 否                     |
| POST   | `/api/feedback`           | JSON 评分、意见、可选 SUS                      | `200 { ok, id, susScore }`            | 400、429      | 否          | 否                     |
| GET    | `/api/location`           | 可选 `X-Forwarded-For`                         | `{ city, region, country, lat, lon }` | 500           | 否          | 否                     |
| GET    | `/api/search`             | 查询 `q`                                       | 最多 5 个城市数组                     | 400           | 否          | 否                     |
| GET    | `/api/favorites`          | 无                                             | 当前用户收藏数组                      | 401           | 登录用户    | 是                     |
| POST   | `/api/favorites`          | JSON `name`、`admin1`、`country`、`lat`、`lon` | 新收藏对象                            | 400、401      | 登录用户    | 是                     |
| DELETE | `/api/favorites/:id`      | 路径 `id`                                      | `{ success: true }`                   | 401、404      | 登录用户    | 是                     |
| GET    | `/api/history`            | 无                                             | 当前用户最近 20 条历史                | 401           | 登录用户    | 是                     |
| POST   | `/api/history`            | JSON `city`、`lat`、`lon`、可选 `weather`      | `{ success: true }`                   | 400、401      | 登录用户    | 是                     |
| DELETE | `/api/history`            | 无                                             | `{ success: true }`                   | 401           | 登录用户    | 是                     |
| GET    | `/api/me`                 | 无                                             | `{ user }`                            | 401           | 登录用户    | 是                     |
| POST   | `/api/admin-login`        | JSON `username`、`password`                    | `{ token }`，并设置 cookie            | 400、401、429 | 否          | 否                     |
| GET    | `/admin/api/overview`     | 无                                             | 用户、收藏、历史、缓存统计            | 401           | 管理员      | 是（管理员）           |
| GET    | `/admin/api/stats`        | 无                                             | 汇总计数、城市/日期/省份统计          | 401           | 管理员      | 是（管理员）           |
| POST   | `/admin/logout`           | 无                                             | `{ success: true }` 并清 cookie       | 401           | 管理员      | 是（管理员）           |
| GET    | `/admin`                  | 可选查询 `token`（会重定向去除）               | 登录页或管理员后台 HTML               | 200、302      | cookie 可选 | 否（后台数据需管理员） |
| DELETE | `/admin/users/:id`        | 路径 `id`                                      | `{ success: true }`                   | 401           | 管理员      | 是（管理员）           |
| PUT    | `/admin/users/:id`        | JSON 可选 `username`                           | `{ success: true }`                   | 400、401      | 管理员      | 是（管理员）           |
| DELETE | `/admin/favorites/:id`    | 路径 `id`                                      | `{ success: true }`                   | 401           | 管理员      | 是（管理员）           |
| DELETE | `/admin/history/:id`      | 路径 `id`                                      | `{ success: true }`                   | 401           | 管理员      | 是（管理员）           |
| POST   | `/admin/clear-cache`      | 无                                             | `{ success: true }`                   | 401           | 管理员      | 是（管理员）           |

## 公开认证接口

### `POST /api/register`

请求体：`{ "username": "demo_user", "password": "demo123" }`。用户名 2–30 位，只允许中英文、数字和下划线；密码 6–100 位。成功返回用户 `id`、`username` 和 7 天 JWT。用户名重复或格式错误为 `400`，认证限流为 `429`。响应不会包含密码哈希。

### `POST /api/login`

请求体字段同注册。凭据正确返回 JWT 和用户基本信息；缺少字段、输入过长或凭据错误分别返回 `400`。密码错误不会透露用户名是否存在。

### `POST /api/admin-login`

请求体为管理员用户名和明文密码，服务端与环境变量中的 bcrypt 哈希比对。成功返回随机管理员 token，并设置 `admin_token` HttpOnly、SameSite=Strict cookie；凭据错误为 `401`。

## 天气与反馈接口

### `GET /api/weather`

查询参数 `lat`（-90 到 90）和 `lon`（-180 到 180）必须是有限数字。服务端按两位小数缓存并代理 Open-Meteo 7 日预报；参数缺失或越界为 `400`，上游失败为 `500`。

### `GET /api/air`

查询参数同天气接口，代理 Open-Meteo `pm10`、`pm2_5`、`us_aqi`。参数错误为 `400`，上游不可用或 AQI 无效为 `502`。

### `POST /api/feedback`

请求体字段：`rating`（1–5 整数）、`comment`（最多 2000 字符）、可选 `sus`（10 个 1–5 整数）、`scenario`（最多 120 字符）、`adviceAccuracy`（1–5）。服务端保存反馈和 SUS 分数；校验失败为 `400`，成功返回反馈 ID。接口限流为 `429`。

### `GET /api/location` 与 `GET /api/search`

定位接口优先使用 IPAPI，失败后使用 ip-api.com，并缓存结果；两家服务均失败返回 `500`。搜索接口 `q` 缺失或为空返回空数组，超过 64 字符返回 `400`，上游异常时返回空数组。

## 登录用户数据接口

收藏对象的 `name`、`admin1`、`country` 最多 128 字符，经纬度必须在合法范围内；同一用户两位小数范围内重复收藏为 `400`。删除不存在的本人收藏为 `404`。历史对象的 `city` 最多 64 字符，单用户自动保留最近 100 条，列表接口返回最近 20 条。

## 管理员接口与数据安全

`/admin/api/overview` 返回的用户字段只有 `id`、`username`、`createdAt`；`password` 永远不会出现在 API 响应。管理员页面返回固定 HTML 骨架，数据库值由浏览器用 `textContent` 写入表格，避免把数据库值插入 `innerHTML`。管理员删除接口按 ID 操作，清缓存接口删除天气缓存，不删除用户数据。

所有未匹配错误会由 Express 错误处理中间件转换为 JSON：服务器内部错误为 `500 { "error": "服务器内部错误" }`，可识别的请求错误保留对应状态码和错误信息。

## TASK-022 请求解析升级验收（2026-10-05）

执行不带 `--force` 的 `npm audit fix`，锁定版本 `express` 4.22.2→4.22.3、`body-parser` 1.20.5→1.20.8、`qs` 6.15.2→6.16.0，均未跨大版本；`package.json` 的依赖声明以及其他直接运行时依赖的锁定版本未变。升级前审计为 3 个 moderate、0 个 high/critical，升级后 `docs/audit.json` 的全部漏洞计数为 0。

升级前基线来自提交 `89a02b1ca645b692ff015597da70262828e85d6b` 的完整导出及原锁文件 `npm ci`；升级后使用当前仓库的新锁文件安装。两边分别启动真实 `server.js` 子进程，使用随机独立端口、临时数据库和测试凭据；天气及搜索请求访问真实上游，未使用响应桩。HTTP 请求完成后比较状态码、递归 JSON 字段与类型、错误信息和缓存头，并确认服务进程仍存活；测试数据库已清理。

| 实测请求                                                  | 升级前 | 升级后 | 对照结果                                                                                         |
| --------------------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------ |
| `GET /api/weather?lat=39.9&lon=116.4`                     | 200    | 200    | JSON 字段及递归类型一致，`hourly.time` 168 项、`daily.time` 7 项                                 |
| `GET /api/search?q=北京`                                  | 200    | 200    | 3 个城市，形状为 `[{ name: string, admin1: string, country: string, lat: number, lon: number }]` |
| `GET /api/weather?lat[0]=1&lat[1]=2`                      | 400    | 400    | 均为 `{ "error": "缺少经纬度参数" }`，未出现 500 或崩溃                                          |
| `POST /api/register`，JSON body                           | 200    | 200    | 均为 `{ token: string, user: { id: string, username: string } }`                                 |
| `POST /api/register`，`application/x-www-form-urlencoded` | 400    | 400    | 均为 `{ "error": "用户名和密码不能为空" }`                                                       |
| `GET /js/main.js?v=5e5652e4`                              | 200    | 200    | 均为 JavaScript，`Cache-Control: public, max-age=31536000, immutable`                            |

缓存请求的 URL 来自各自 `GET /index.html` 响应的 importmap 中 `imports["app/main"]`，哈希未手写作为测试输入。天气响应的顶层字段均为 `latitude`、`longitude`、`generationtime_ms`、`utc_offset_seconds`、`timezone`、`timezone_abbreviation`、`elevation`、`current_weather_units`、`current_weather`、`hourly_units`、`hourly`、`daily_units`、`daily`；动态天气数值不作为相等断言。

可达性结论：应用只启用 `express.json({ limit: '32kb' })`，未启用 `express.urlencoded()`，因此 body-parser 的 URL-encoded 解析路径不可达；但 `req.query` 使用 qs，天气、搜索和资源缓存分支仍暴露查询串解析。原风险属于公开端点上的 DoS，未涉及数据泄露，本次已通过同大版本升级消除。

回归结果：`npm test` 6/6、`npm run lint`、`npm run check:versions`（PASS: 15）、`npm run check:evidence -- --static-only`、`node --check server.js`、`git diff --check` 均通过。`npm run format:check` 仍因原有 `docs/DESIGN.md` 未格式化而失败，使用基线提交中的该文件单独检查也返回 1；该文件不在 TASK-022 写作用域内，未修改，本文及 README、audit.json 的格式检查通过。

已核对 CI 使用 `npm ci`，按新锁文件在本机执行后显示 `found 0 vulnerabilities`。未添加可选的 CI audit 步骤（工作流不在本任务写作用域）；后续添加时应使用 `npm audit --audit-level=high`。
