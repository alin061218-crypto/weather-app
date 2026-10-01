# TASK-004 证据 — 未处理异常、输入校验、JWT 失效

> ⚠️ **必须在 TASK-004 动手之前把 before 定稿。** 采集环境：PowerShell 7 / node v24.16.0 / 端口 3999

## before.txt（原始基线，`ce2ba78` 时期实测；部分在 `ef17080` 上复测仍存在）

```
### 1) 未处理异常 → 500 + 完整 Node 堆栈（泄漏绝对路径）
POST /api/history   {}          （带合法用户 token）
  -> 500
  -> 响应体含： SqliteError: NOT NULL constraint failed: history.city
                at E:\weather\weather-backend\server.js:253:21
                at Layer.handle [as handle_request] (E:\weather\...)

### 2) 已删除用户的 token 仍然有效（JWT 从不查库）
DELETE /admin/users/<已登录用户id>     （管理员操作，删除成功）
GET    /api/me   （仍用被删用户的 token）
  -> 200  {"user":{"id":"1790854207165","username":"tester01","iat":1790854207,"exp":1791459007}}
  即：账号已被删除，token 在 7 天有效期内依旧畅通。

### 3) 收藏接口对 lat/lon 完全无校验
POST /api/favorites  {"name":"x","lat":"abc","lon":116.4}
  -> 200，且 SQLite 把 'abc' 以 TEXT 类型存进 REAL 列
     实测导出： [{"lat":"abc","tlat":"text","lon":116.4,"tlon":"real"}]
  连带影响：去重语句 ABS(lat - 'abc') < 0.01 语义错乱
POST /api/favorites  {"name":"x","lat":{},"lon":1}
  -> 500  RangeError: Too few parameter values were provided

### 4) 主键用 Date.now()，同毫秒两条记录会撞 UNIQUE 约束
POST /api/history ×2（同一毫秒内）
  -> SqliteError: UNIQUE constraint failed: history.id

### 5) 前端确实会触发上面第 1 条
weather-app/js/main.js:866 发送 city: c.name，而 JSON.stringify 会丢弃 undefined 的键
  → 缺 city 时正好触发 NOT NULL 约束
```

## after.txt（TASK-004 完成后由执行方填入）

```
（待填）
期望：
  POST /api/history {}                        -> 400 + JSON 通用错误，响应体不含 "at E:\\" 或 "SqliteError"
  DELETE 用户后 GET /api/me                    -> 401
  POST /api/favorites {"lat":"abc"}            -> 400
  POST /api/favorites {"lat":{}}               -> 400
  同毫秒连续两次 POST /api/history              -> 两条都成功（主键改 crypto.randomUUID）
  NODE_ENV=production 时错误体不含堆栈
```

## note.md — 设计理由

**为什么必须有终端错误处理中间件。** Express 默认交给 `finalhandler`，而它按
`process.env.NODE_ENV || 'development'` 判断是否返回 `err.stack`（见
`node_modules/finalhandler/index.js`）。仓库里没有任何地方设置 `NODE_ENV`，
因此**线上也在向任意客户端吐完整堆栈**，泄漏目录结构与源码行号。
正解：4 参数错误处理中间件 —— 服务端记 `err.stack`，客户端只收通用 JSON 500。

**为什么「token 有效」不等于「用户存在」。** 无状态 JWT 的固有特性：签发后服务端不再参与校验。
对需要「删除用户 / 封禁账号 / 改密码后踢下线」的系统，必须在 `authMiddleware` 里按
`payload.id` 回查数据库；更完整的做法是加 `tokenVersion` 声明并在敏感变更时递增。

**为什么主键不能是 `Date.now()`。** 毫秒级时间戳在并发下不唯一。`crypto.randomUUID()`
既保证唯一也不暴露创建时间。

**为什么校验要放在服务端而非依赖前端。** 前端校验只防误操作，不防攻击者。
`/api/weather` 已经做了数值与范围校验（`server.js:164-167`），
而 `/api/favorites` 完全没做 —— 同一项目内两套标准，属于实现不一致。

**复现命令**
```powershell
cd E:\weather\weather-project
$env:DB_DIR="$env:TEMP\wtest\db"; $env:PORT='3999'; $env:JWT_SECRET='dev-only-secret-at-least-32-chars-long!!'
node server.js
```
