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
