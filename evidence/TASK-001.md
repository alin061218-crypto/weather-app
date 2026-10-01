# TASK-001 证据 — 管理接口越权访问

> 采集环境：Windows / PowerShell 7 / node v24.16.0 / `DB_DIR` 指向临时目录 / `PORT=3999`
> 采集方式：对 `weather-project/server.js` 起服务后发真实 HTTP 请求
> **这个文件的价值全在「修复前」那一列 —— 修复后 `before.txt` 再也测不出来。**

## before.txt（修复前，基线提交 `ce2ba78`）

```
# 不带任何 Authorization 请求头，直接调用 5 个管理写接口
POST   /admin/clear-cache          -> 200  {"success":true}
DELETE /admin/favorites/anything   -> 200  {"success":true}
DELETE /admin/history/anything     -> 200  {"success":true}
DELETE /admin/users/anything       -> 200  {"success":true}
PUT    /admin/users/1              -> 200  {"success":true}
```

**危害**：`DELETE /admin/users/:id` 会连带级联删除该用户的全部收藏与历史；
`POST /admin/clear-cache` 清空天气缓存。且 `server.js:104` 的 `app.use(cors())` 返回
`Access-Control-Allow-Origin: *`，因此**任何网页都能在受害者浏览器里发起这些 DELETE**，
无需任何凭据即可清空数据库。

## after.txt（修复后，提交 `ef17080`）

```
### 无 token（期望全部 401）
POST   /admin/clear-cache         -> 401
DELETE /admin/favorites/x         -> 401
DELETE /admin/history/x           -> 401
DELETE /admin/users/x             -> 401
PUT    /admin/users/x             -> 401

### 伪造 / 空 token（期望 401）
token='admin_123_fake'            -> 401
token=''                          -> 401
token='Bearer xyz'                -> 401

### query 参数传 token 是否被接受（期望 401，防止 URL 泄漏被利用）
POST /admin/clear-cache?token=whatever -> 401

### 带合法 token（期望 200）
POST   /admin/clear-cache         -> 200  {"success":true}
DELETE /admin/favorites/x         -> 200  {"success":true}
DELETE /admin/history/x           -> 200  {"success":true}
DELETE /admin/users/x             -> 200  {"success":true}
PUT    /admin/users/x             -> 200  {"success":true}

### 功能未回归：合法用户名改名真的写进库了
PUT /admin/users/1790858973969 {"username":"renamed02"} -> 200
直接读 SQLite： [{"id":"1790858973969","username":"renamed02"}]     ← 改名生效

### 新增加的注入路径校验
PUT /admin/users/1790858973969 {"username":"<img src=x>"} -> 400 {"error":"用户名只能包含中英文、数字和下划线"}
```

## note.md — 设计理由（可写进论文「系统设计」章节）

**为什么「页面鉴权」不等于「接口鉴权」。**
原实现只在渲染 `/admin` 这个 HTML 页面时校验了一次 `ADMIN_TOKENS`（`server.js:363` 的
`if (req.query.token && ADMIN_TOKENS.has(req.query.token))`），而 5 个真正执行破坏性操作的
写接口上**没有任何鉴权中间件**。这是一种典型误区：把「能否看到管理界面」当成了
「能否执行管理操作」。正确做法是把授权判定下沉到每一个执行副作用的接口上，
即 `app.delete('/admin/users/:id', adminAuth, handler)` 这种逐路由挂载方式。

**为什么鉴权只认 `Authorization` 头、不接受 query 参数。**
如果把 token 放在 URL 里，它会进入浏览器历史、服务器访问日志与 `Referer` 请求头。
因此 `adminAuth` 用 `authorization.match(/^Bearer\s+(.+)$/i)` 只从请求头取 token，
管理页面自身的 fetch 也改为携带 `Authorization = 'Bearer ' + adminToken`。
（`/admin?token=…` 这个 URL 形式仍用于首次进入页面，彻底移除属于 TASK-002 的范围。）

**遗留（归 TASK-002，不要误判为 TASK-001 未完成）**
- `ADMIN_TOKENS.set(token, Date.now())` 存了时间戳但从未读取 → token **永不过期**
- token 由 `Math.random()` 生成，非 CSPRNG
- 口令用 `===` 比较，非恒定时间比较
- `server.js:278` 仍是硬编码管理员口令（用户名与口令均写在源码里，已于 TASK-002 移除并轮换；
  为避免明文口令进入仓库，此处不记录口令字面值）

**复现命令**
```powershell
cd E:\weather\weather-project
$env:DB_DIR="$env:TEMP\wtest\db"; $env:PORT='3999'; $env:JWT_SECRET='dev-only-secret-at-least-32-chars-long!!'
node server.js     # 另开一个 pwsh 7 窗口执行上面的请求
```
