# 天气应用答辩演示脚本

本文是答辩现场的操作顺序。演示前先完成“必须由人操作的前置步骤”，并确认 `.env` 已存在于本机且不会提交到 Git。

## 0. 演示方案与重要配置

作者已选定路线 B：本机运行 + Cloudflare Tunnel + `weather.alin061218.online`。

- 主路径是本机演示：`http://localhost:3001`。`localhost` 属可信上下文，自动定位可用，无需 HTTPS。
- 公网路径是隧道演示：`https://weather.alin061218.online`。
- 隧道目前尚未接通；公网验收状态：**待作者完成 Cloudflare 侧操作**，不得将其写成已验证。
- `cloudflared` 已安装，版本为 `2026.10.0`，可执行文件是 `C:\Program Files (x86)\cloudflared\cloudflared.exe`，并已写入机器级 PATH。
- PATH 修改必须在**新开终端**后才会被当前终端识别。
- 隧道演示的 `.env` 应设置 `NODE_ENV=production`，这样 Cookie 才会带 `Secure`。
- `localhost` 仍可正常登录；改用局域网 IP（例如 `http://192.168.x.x:3001`）时，`Secure` Cookie 发不出去，登录会静默失效。演示固定使用 localhost 或隧道域名。

## 1. 必须由人操作的前置步骤

以下步骤需要作者在浏览器中登录 Cloudflare 账号或在 Cloudflare 控制台确认，不能由仓库脚本代办。

### 第 0 步：确认域名已在 Cloudflare

1. 浏览器打开 <https://dash.cloudflare.com> 并登录 Cloudflare。
2. 确认 `alin061218.online` 已经是 Cloudflare 站点。
3. 如果不是：添加该站点，记录 Cloudflare 给出的两个 NS，然后到阿里云域名控制台把 NS 改成这两个值。NS 生效通常需要 **1–48 小时**。

### 第 1 步：授权 cloudflared

在**新开终端**运行：

```powershell
cloudflared tunnel login
```

命令会打开浏览器。登录 Cloudflare 后选择 `alin061218.online` 并授权。

### 第 2 步：创建隧道

```powershell
cloudflared tunnel create weather-demo
```

记下命令输出的 Tunnel UUID。后续配置中的 `<TUNNEL-UUID>` 和凭据文件名都使用这个 UUID。

### 第 3 步：绑定 DNS

```powershell
cloudflared tunnel route dns weather-demo weather.alin061218.online
```

### 第 4 步：写入隧道配置

创建 `%USERPROFILE%\.cloudflared\config.yml`，把 `<TUNNEL-UUID>` 换成第 2 步记下的 UUID：

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: C:\Users\<你的用户名>\.cloudflared\<TUNNEL-UUID>.json
ingress:
    - hostname: weather.alin061218.online
      service: http://127.0.0.1:3001
    - service: http_status:404
```

凭据 JSON 文件应由 `cloudflared tunnel create` 写入 `%USERPROFILE%\.cloudflared\`。不要把该 JSON、Token 或其他密钥写进仓库。

## 2. 两条启动路径

### 本机演示（主路径）

在仓库根目录 `E:\weather\weather-project` 打开窗口 A：

```powershell
node --env-file=.env server.js
```

浏览器打开：<http://localhost:3001>

`localhost` 属可信上下文，自动定位可用，无需 HTTPS。

### 公网演示（隧道）

先确认 `.env` 中有 `NODE_ENV=production`，然后开两个终端窗口。

窗口 A：

```powershell
cloudflared tunnel run weather-demo
```

窗口 B，在仓库根目录运行：

```powershell
node --env-file=.env server.js
```

浏览器访问：<https://weather.alin061218.online>

隧道是否真的通，必须以手机关闭 Wi-Fi 后用 4G 打开该域名的 HTTPS 验收为准。当前仓库验收不替代作者的 Cloudflare 浏览器操作，隧道状态仍记为**待作者完成 Cloudflare 侧操作**。

## 3. 答辩演示顺序

按下面顺序操作，每一步都展示页面反馈：

1. 打开首页，说明当前天气卡片和页面布局。
2. 点击“自动定位”，允许浏览器定位授权，展示定位城市和天气结果。
3. 搜索并切换到另一个城市，确认城市天气随选择刷新。
4. 查看 **24h 曲线**，再查看 **7 天温度指纹**，说明短期趋势与一周温度变化。
5. 进入登录入口，使用备用账号登录。
6. 收藏当前城市，刷新或切换页面后确认收藏仍在。
7. 打开历史记录，展示已查询的城市与天气历史。
8. 打开生活指数，展示穿衣、活动等建议。
9. 打开意见反馈，完成 **SUS 问卷**并提交。
10. 打开后台 `/admin`，使用管理员账号登录，展示后台概览；演示结束后退出后台账号。

## 4. 备用账号

需要临时创建备用管理员账号时，在仓库根目录运行下面的命令。把命令输出的哈希写入本机 `.env` 的 `ADMIN_PASSWORD_HASH`，并按需设置 `ADMIN_USER`；不要把密码明文写入文档、脚本、日志或 Git。

```powershell
node scripts/hash-password.js "<现场自行输入的临时密码>"
```

修改 `.env` 后重启 `server.js`。`.env` 已被 `.gitignore` 忽略，提交前仍应检查 `git status`，确保没有密钥或密码进入版本库。

## 5. 断网降级

网络正常时先把首页和需要展示的页面打开，并等待 PWA Service Worker 完成预缓存。现场断网后：

- PWA 已预缓存的页面外壳和静态资源仍可打开。
- 已在浏览器本地缓存的最近天气数据可用于展示已有结果。
- 实时天气、城市搜索、自动定位后的远程天气请求、登录、收藏、历史、生活指数、意见反馈和 `/admin` 都依赖后端或外部网络，断网时可能不可用。

## 6. HTTPS 唯一验收判据

用手机关闭 Wi-Fi，切换 4G/5G，打开 <https://weather.alin061218.online>，点击“自动定位”：**能弹出浏览器定位授权，才算 HTTPS 真的生效**。

HTTP 下 Geolocation 会被浏览器拒绝，详见 doc 07 第三节。仅能打开页面、看到地址栏或收到 HTTP 响应，都不能替代这个判据。

## 7. 现场检查清单

- [ ] 已在 Cloudflare 控制台确认站点和 DNS 状态。
- [ ] 已在**新开终端**中完成 `cloudflared tunnel login`，并准备好 Tunnel UUID 与 `config.yml`。
- [ ] `.env` 中 `NODE_ENV=production` 已用于隧道演示；本机演示可继续使用现有配置。
- [ ] 窗口 A、窗口 B 的启动命令按第 2 节执行。
- [ ] 手机 4G/5G 自动定位授权弹窗已出现，才宣称 HTTPS 验收通过。
- [ ] 录屏兜底：**作者决定不做**。
