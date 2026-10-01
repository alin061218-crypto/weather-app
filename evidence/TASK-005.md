# TASK-005 证据 — 参数注入、缓存投毒、外围加固

> ⚠️ **必须在 TASK-005 动手之前把 before 定稿。** 采集环境：PowerShell 7 / node v24.16.0 / 端口 3999

## before.txt（原始基线实测）

```
### 1) /api/weather 参数注入 + 缓存投毒
GET /api/weather?lat=1&lon=1%26foo=bar          -> 200
  parseFloat("1&foo=bar") === 1 通过校验（:164-167 用 parseFloat 是前缀宽容的）
  但 :177 拼接上游 URL 时用的是原始字符串：
      fetch(`${WEATHER_API}?latitude=${lat}&longitude=${lon}&${params}`)
  而 :169 的缓存键用的是解析后的数值：
      cacheKey = latNum.toFixed(2) + ',' + lonNum.toFixed(2)
  → 攻击者可构造 ?lat=39.9&forecast_days=92 之类的额外上游参数，
    响应却被写进受害者正常的缓存键下，600 秒 TTL 内所有正常请求读到被投毒的数据。
  注：不是 SSRF（主机名是常量 :157），是参数注入 + 缓存投毒。

### 2) .claude/ 工具配置可被公网读取（express.static 默认放行点目录内的文件）
GET /.claude/settings.local.json   -> 200
  （用真实 webroot + express 4.21 实测；也确认 send 模块在 dotfiles 未设置时，
    只对「以点开头的文件」返回 404，对「点目录里的普通文件」照常服务）
  同样可读： /.claude/settings.json  /.claude/app.js

### 3) CORS 完全开放
GET /api/weather  （带 Origin: https://evil.example）
  -> Access-Control-Allow-Origin: *

### 4) 登录接口无任何速率限制
连续 25 次错误口令 POST /api/login
  -> 400 × 25，没有锁定、没有 429
  每次尝试都执行 bcrypt cost 10 → 可被用作 CPU 耗尽型 DoS

### 5) 上游 fetch 无超时
server.js:177 的 await fetch(...) 未传 signal（对比 :189 与 :443 都有 AbortSignal.timeout）
  → 上游挂起时 Express 请求被无限占住

### 6) 无任何安全响应头
无 helmet / CSP / Referrer-Policy / HSTS；无 app.set('trust proxy', 1)
```

## after.txt（TASK-005 完成后由执行方填入）

```
（待填）
期望：
  GET /api/weather?lat=39.9&lon=1%26forecast_days=92  -> 上游 URL 中 longitude 只含数值
  GET /.claude/settings.local.json                    -> 404
  GET /api/image?q=x                                  -> 404（该接口无任何调用者，已删除）
  带 Origin: https://evil.example                      -> 无 Access-Control-Allow-Origin: *
  连续 15 次错误登录                                    -> 出现 429
  GET /admin 响应含 Referrer-Policy                    -> 是
```

## note.md — 设计理由

**为什么「校验用解析后的值」不等于「拼接时也用解析后的值」。** 这是很典型的疏漏：
`server.js:164` 已经把 `lat`/`lon` 转成 `latNum`/`lonNum` 并做了范围校验，
但 `:177` 拼 URL 时又回头用了原始字符串。一行之差（`${lat}` → `${latNum}`），
却把「输入校验」这道防线完全绕过了 —— 校验结果必须**传递**到实际使用点。

**为什么缓存键与校验值必须同源。** 缓存键用数值（`:169`）而上游请求用原始串，
两者的「身份」不一致，攻击者就能让「A 的响应」被存进「B 的键」。缓存系统的正确性前提是
**键必须由与请求等价的规范形式生成**。

**为什么禁用点文件服务。** `express.static` 没设 `dotfiles`，`send` 的默认行为是
「点开头的文件 404、点目录下的普通文件 200」。项目把 `frontend/.claude/` 提交进了仓库，
于是作者的本地工具权限白名单被公开服务出去。正解两件一起做：
`express.static(root, { dotfiles: 'deny' })` + `git rm -r --cached frontend/.claude`。

**为什么要删 `/api/image` 而不是加固它。** 它没有任何调用者（前端城市指南早已改用纯文本卡片），
却是一个**未鉴权的外部抓取代理**（伪造 Chrome UA 爬 `cn.bing.com`），既能被当作开放代理滥用，
也违反对方服务条款。**没有调用者的功能就是负债**。

**复现命令**
```powershell
cd E:\weather\weather-project
$env:DB_DIR="$env:TEMP\wtest\db"; $env:PORT='3999'; $env:JWT_SECRET='dev-only-secret-at-least-32-chars-long!!'
node server.js
```
