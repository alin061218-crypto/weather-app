# 天气应用答辩演示脚本

本文是答辩现场的操作顺序。

> **2026-10-06 更新**：路线 B（本机 + Cloudflare Tunnel + `weather.alin061218.online`）
> **已全部接通并通过验收** —— 手机关 Wi-Fi 用 4G 打开固定域名、点「自动定位」**弹出授权**。
> 隧道与应用均**已服务化/自启**：重启电脑后不需要敲任何命令。

## 0. 当前基础设施终态

| 组件         | 值 / 运行方式                                                         | 自启                                      |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------- |
| 固定域名     | `https://weather.alin061218.online`                                   | —                                         |
| 域名 NS      | `edward.ns.cloudflare.com` / `lila.ns.cloudflare.com`（注册局已收录） | —                                         |
| 隧道         | `weather-demo`，UUID `d1057273-b4ef-465f-a7c8-30eadee90ee2`           | —                                         |
| **隧道进程** | **Windows 服务 `cloudflared`**                                        | ✅ `Automatic`                            |
| **应用进程** | **PM2 `weather-app`**（`node --env-file=.env server.js`）             | ✅ 计划任务 `pm2-resurrect`（登录时触发） |
| 源站         | `http://localhost:3001`                                               | —                                         |
| `.env`       | `NODE_ENV=production`（走 HTTPS 时 Cookie 才带 `Secure`）             | —                                         |

**结论：重启电脑后不用敲任何命令。** 隧道服务与 `pm2 resurrect` 会自动把两个进程起回来。

三条路径（按可靠度排序）：

1. **本机演示（主路径，100% 可靠）**：`http://localhost:3001`。`localhost` 属可信上下文，自动定位可用，无需 HTTPS。
2. **固定域名（已验收）**：`https://weather.alin061218.online` —— 走隧道，HTTPS 已确认生效。
3. **临时隧道（兜底）**：见第 2 节 ③，不需要账号/域名，但地址每次重启都变。

⚠️ 改用**局域网 IP**（`http://192.168.x.x:3001`）访问时 `Secure` Cookie 发不出去、**登录会静默失效**。
演示固定使用 `localhost` 或隧道域名。

---

## 1. 开机自检（★ 答辩当天第一件事）

一条命令看四项，全部符合预期再开始演示：

```powershell
@{
  'cloudflared 服务' = (Get-Service cloudflared).Status
  'PM2 应用'         = (pm2.cmd jlist 2>$null | ConvertFrom-Json | Where-Object { $_.name -eq 'weather-app' }).pm2_env.status
  '本地健康'         = (curl.exe -s -o NUL -w '%{http_code}' http://127.0.0.1:3001/health)
  '公网健康'         = (curl.exe -s -o NUL -w '%{http_code}' https://weather.alin061218.online/health)
} | Format-Table -AutoSize
```

**期望：`Running` / `online` / `200` / `200`**

### 如果某一项不对

| 现象                            | 处理                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cloudflared 服务` 不是 Running | 管理员 PowerShell：`Start-Service cloudflared`                                                            |
| `PM2 应用` 不是 online          | `pm2.cmd resurrect`；仍不行则 `pm2.cmd start server.js --name weather-app --node-args="--env-file=.env"`  |
| 本地 **200**、公网 **530**      | 隧道没连上：`cloudflared tunnel info weather-demo` 应列出 connector；没有就 `Restart-Service cloudflared` |
| 本地也不是 200                  | 应用没起：`pm2.cmd logs weather-app --lines 30` 看报错                                                    |
| 公网 502                        | 本地服务没跑，或隧道 ingress 指向的端口不对（应为 `localhost:3001`）                                      |

**★ 一条重要经验（本次踩过）**：服务可以"在跑但一个连接都不建" —— 如果同时还有手动窗口在跑，
**故障会被手动进程掩盖**。所以自检必须**先确认没有任何手动 `cloudflared tunnel run` 窗口**。

---

## 2. 三条启动路径

### ① 本机演示（主路径，100% 可靠）

```powershell
node --env-file=.env server.js
```

浏览器打开 <http://localhost:3001>。`localhost` 属可信上下文，自动定位可用，无需 HTTPS。

### ② 固定域名（已验收，走 Windows 服务）

正常情况**什么都不用做** —— 服务与 PM2 都已自启。要手工验证：

```powershell
Get-Service cloudflared
curl.exe -s -o NUL -w "%{http_code}`n" https://weather.alin061218.online/health
```

浏览器访问 <https://weather.alin061218.online>。

**底层构成**（排查时用）：

- 隧道配置 `%USERPROFILE%\.cloudflared\config.yml`：`ingress` 把
  `weather.alin061218.online` 指向 `http://localhost:3001`，末条 `http_status:404` 兜底。
- 服务启动命令（注册表 `HKLM\SYSTEM\CurrentControlSet\Services\Cloudflared` 的 `ImagePath`）：
    ```
    "C:\Program Files (x86)\cloudflared\cloudflared.exe" --config=C:\Users\Lenovo\.cloudflared\config.yml tunnel run
    ```
    ⚠️ **`cloudflared service install` 装出来的 `ImagePath` 不带任何参数**，
    而服务以 `LocalSystem` 身份运行、默认在 `C:\Windows\System32\config\systemprofile\.cloudflared\`
    找配置 —— 那里没有 `config.yml`，于是**服务 Running 但一个连接都不建**。
    上面那个 `ImagePath` 就是修好后的形态。

### ③ 临时隧道（兜底，今天可用）

不需要 Cloudflare 账号、不需要域名、不需要改 NS：

```powershell
cloudflared tunnel --url http://localhost:3001
```

命令输出里的 `https://<随机>.trycloudflare.com` 就是给老师的地址。三条限制：

1. **地址每次重启都变**（`hands-sea-shaped-tea` 是随机子域）→ 演示当天必须重跑并把新地址发出去。
2. **有偶发失败**：设计方抽样 `/css/style.css` 为 200 / 200 / 超时(000) / 200（1/4 超时）；
   本地直连 4/4 正常。刷新通常可恢复；**不要把它当唯一依赖**。
3. **出站 UDP 7844 可能被拦**（日志 `region2 UDP FAIL → degraded transport`），
   可加 `--protocol http2` 减少协议切换抖动：

    ```powershell
    cloudflared tunnel --protocol http2 --url http://localhost:3001
    ```

<details>
<summary>临时隧道实测记录（原文，2026-10-06）</summary>

```text
cloudflared tunnel --url http://localhost:3001
→ Your quick Tunnel has been created! Visit it at:
    https://hands-sea-shaped-tea.trycloudflare.com
→ Registered tunnel connection connIndex=0 ... location=lax13 protocol=quic
连通性预检：DNS PASS / TCP PASS / Cloudflare API PASS
                ⚠️ UDP(region2) FAIL → SUMMARY: degraded transport, 改用 http2
```

设计方从公网独立验证（curl）：

```text
GET /                → 200，首页 19,833 B，<title>天气 · Weather</title>，18 个 ?v=<hash> 引用
GET /health          → 200 {"status":"ok"}
/js/main.js、/manifest.json、/vendor/three.module.js → 全部 200
/css/style.css（经隧道）→ 200/200/超时(000)/200 ⚠️ 抽样 1/4 偶发失败
/css/style.css（本地直连）→ 4/4 正常 → 偶发失败在隧道侧，不是服务端
```

</details>

---

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

修改 `.env` 后重启：`pm2.cmd restart weather-app --update-env`。
`.env` 已被 `.gitignore` 忽略，提交前仍应检查 `git status`，确保没有密钥或密码进入版本库。

## 5. 断网降级

网络正常时先把首页和需要展示的页面打开，并等待 PWA Service Worker 完成预缓存。现场断网后：

- PWA 已预缓存的页面外壳和静态资源仍可打开。
- 已在浏览器本地缓存的最近天气数据可用于展示已有结果。
- 实时天气、城市搜索、自动定位后的远程天气请求、登录、收藏、历史、生活指数、意见反馈和 `/admin` 都依赖后端或外部网络，断网时可能不可用。
- **兜底**：断网时改用本机演示路径（`http://localhost:3001`），它不经公网。

## 6. HTTPS 唯一验收判据（✅ 已于 2026-10-06 通过）

用手机关闭 Wi-Fi，切换 4G/5G，打开 <https://weather.alin061218.online>，点击“自动定位”：**能弹出浏览器定位授权，才算 HTTPS 真的生效**。

HTTP 下 Geolocation 会被浏览器拒绝，详见 doc 07 第三节。仅能打开页面、看到地址栏或收到 HTTP 响应，都不能替代这个判据。

> 结果记录见 `evidence/TASK-010b/https-acceptance.md`：
> 「自动定位弹出授权」是**作者手持设备的人工观察**，不是字节级可复现的产物 ——
> 但它恰恰是这个判据唯一成立的证明方式（无头浏览器代表不了真实移动端的安全上下文与权限弹窗）。

## 7. 前置步骤（✅ 已完成，保留供换机 / 重装参考）

以下步骤需要作者在浏览器中登录 Cloudflare 账号，不能由仓库脚本代办。

1. **改 NS**：`dash.cloudflare.com` 添加站点 → 到阿里云域名控制台把 NS 从
   `dns31.hichina.com` / `dns32.hichina.com` 改成 Cloudflare 给出的
   `edward.ns.cloudflare.com` / `lila.ns.cloudflare.com` → 等 **1–48 小时**
   （本次实测约 40 分钟就全部传播完）。改之前确认域名**未开启 DNSSEC**。
2. **安装 cloudflared**：`winget install Cloudflare.cloudflared`（本次版本 `2026.10.0`）。
   ⚠️ PATH 修改必须**新开终端**才生效。
3. **授权**：`cloudflared tunnel login` → 浏览器里选 `alin061218.online` 并授权。
4. **建隧道**：`cloudflared tunnel create weather-demo` → 记下 UUID 与凭据 JSON 路径。
5. **绑 DNS**：`cloudflared tunnel route dns weather-demo weather.alin061218.online`。
6. **写配置** `%USERPROFILE%\.cloudflared\config.yml`：

    ```yaml
    tunnel: <TUNNEL-UUID>
    credentials-file: C:/Users/<用户名>/.cloudflared/<TUNNEL-UUID>.json
    ingress:
        - hostname: weather.alin061218.online
          service: http://localhost:3001
        - service: http_status:404
    ```

    ⚠️ 用**完整 `ingress:` 形式**，不要用 `url:` 简写 —— 简写能让 `tunnel run` 跑起来，
    但 `cloudflared tunnel ingress validate` 会报 “doesn't contain any ingress rules”。
    校验：`cloudflared tunnel ingress validate`（期望 `OK`）。

7. **装服务**：管理员 PowerShell 运行 `cloudflared service install`，
   然后**必须**把注册表 `HKLM\SYSTEM\CurrentControlSet\Services\Cloudflared` 的 `ImagePath` 改成
   第 2 节 ② 里那条带 `--config=... tunnel run` 的形式，否则服务会空转。
8. **应用自启**：

    ```powershell
    pm2.cmd save
    schtasks /create /tn "pm2-resurrect" /tr "cmd /c pm2 resurrect" /sc onlogon /f
    ```

    （PM2 的 `startup` 子命令**不支持 Windows**，所以用计划任务。）

不要把凭据 JSON、Token 或其他密钥写进仓库。

## 8. 现场检查清单（最终版）

- [ ] **第 1 节的四项自检全部符合预期**（Running / online / 200 / 200）。
- [ ] 确认**没有**残留的手动 `cloudflared tunnel run` 窗口（否则会掩盖服务故障）。
- [ ] 手机 4G/5G 打开固定域名后「自动定位」能弹授权（第 6 节判据）。
- [ ] `.env` 中 `NODE_ENV=production` 已生效（改过就 `pm2.cmd restart weather-app --update-env`）。
- [ ] 演示顺序按第 3 节走一遍；SUS 问卷能提交。
- [ ] 兜底路径已实测：本机 `http://localhost:3001` 可打开。
- [ ] 录屏兜底：**作者决定不做**。
