# TASK-003 证据 — 管理页存储型 XSS 与密码哈希下发

> ⚠️ **必须在 TASK-003 动手之前把 before 定稿。** 转义一旦加上，这些数据就再也测不出来了。
> 采集环境：PowerShell 7 / node v24.16.0 / 服务跑在 3999 / 基线为 TASK-001 完成后的 `ef17080`
> 说明：TASK-001 只堵掉了 `PUT /admin/users/:id` 这一条注入路径（用户名正则校验），
> **另外两条路径仍然敞开**，所以 TASK-003 依然必须做。

## before.txt（截至 `ef17080`，实测仍然存在）

```
### 注入路径 1：收藏名（普通用户即可，无需管理员）
POST /api/favorites
  {"name":"<img src=x onerror=alert(document.cookie)>","lat":1.5,"lon":2.5}
  -> 200                                   # server.js:227 只校验真值，不校验内容

### 注入路径 2：查询历史里的城市名（普通用户即可）
POST /api/history
  {"city":"<svg/onload=alert(1)>","lat":3.5,"lon":4.5}
  -> 200                                   # server.js:251 对 city 无任何校验

### 结果：恶意串原样出现在管理员页面的 HTML 里
GET /admin?token=<管理员token>
  含未转义 '<img src=x onerror=alert(document.cookie)>'  = True
  含未转义 '<svg/onload=alert(1)>'                       = True

### 同一页面还在下发 bcrypt 密码哈希
  页面匹配 /\$2[aby]\$/                                   = True
  实际样本： $2a$10$Dd/8THjIPHX5aYoA7JmU...
```

**危害**：任意注册用户写入的字符串会在管理员浏览器里以脚本形式执行 →
可读取同页面内的全部用户哈希、并以管理员身份调用管理接口。属**存储型 XSS + 越权组合**。

**对应源码汇聚点**（全部是原始字符串插值，无转义）
- `server.js:325` `<input type="text" value="${u.username}" onchange="updateUser('${u.id}',…)"` — 属性上下文
- `server.js:335` `<td>${f.name}</td><td>${f.admin1||''}</td>` — 文本上下文
- `server.js:343` `<td>${h.city}</td><td>${(h.weather||'').substring(0,20)}</td>`
- `server.js:322,326` `<th>密码(哈希)</th>` + `<td>${u.password}</td>`

## after.txt（TASK-003 完成后由执行方填入）

```
（待填）
期望：
  含未转义 payload  = False
  含转义后 '&lt;img src=x' = True
  页面匹配 /\$2[aby]\$/    = False
  管理员增删改功能正常，用户名/城市名正常显示
```

## note.md — 设计理由

**为什么「输入校验」不能替代「输出编码」。** 一个字符串可能出现在 HTML 文本、HTML 属性、
JS 字符串、URL 四种上下文里，各自的转义规则不同；对输入做黑名单过滤总会漏，而**在输出处
按上下文编码是唯一可证明正确的做法**。原实现两者都没做，因此 TASK-003 应同时补上：输出转义
（主）+ 字段校验（辅，已在 TASK-004 覆盖）。

**为什么禁止用字符串拼 HTML。** 更彻底的修法是让 `GET /admin` 只返回静态页面骨架，
表格数据改由 `GET /admin/api/overview` 以 JSON 返回、前端用 `textContent` 渲染 ——
这样从根上不存在 HTML 注入点。**推荐采用这个方案**，它同时也是论文里一个可写的设计决策。

**为什么绝不能把 `password` 列发给客户端。** 管理视图查询应改成
`SELECT id, username, createdAt FROM users`。bcrypt 哈希虽不可逆，但一旦泄露即可离线爆破，
而它本来完全不需要出现在浏览器里 —— 属最小权限/最小披露原则。

**复现命令**
```powershell
cd E:\weather\weather-project
$env:DB_DIR="$env:TEMP\wtest\db"; $env:PORT='3999'; $env:JWT_SECRET='dev-only-secret-at-least-32-chars-long!!'
node server.js
# 另开 pwsh 7：注册普通用户 → 写 payload → 用管理员 token 打开 /admin 检查
```
