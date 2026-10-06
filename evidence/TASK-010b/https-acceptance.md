# TASK-010b 公网演示验收记录（HTTPS 生效判据）

## 结论

✅ **通过** —— 自定义域名 + Cloudflare Tunnel 的公网演示链路**端到端可用**，
且 **HTTPS 真正生效**（手机 4G 下 Geolocation 弹出授权）。

## 验收时间与方法

- 时间：**2026-10-06**（Asia/Shanghai）
- **判据（唯一可靠的那一条）**：
  手机**关闭 WiFi、用 4G/5G** 访问 <https://weather.alin061218.online>，
  点击页面上的「**自动定位**」→ **浏览器弹出定位授权提示** ✅
- 执行人：**作者本人**
  （该判据只能由手持移动设备的作者完成 —— 设计方与 codex 都无法代测）

## 这条判据为什么算数

浏览器的 **Geolocation API 只在安全上下文（secure context）可用**。
`http://你的域名` **不算**安全上下文 → 定位会被浏览器直接拒绝，只能退回 IP 定位。

**手机在 4G 下弹出定位授权 = HTTPS 确实生效** ✅

这正是 `07-域名与内网穿透部署方案.md` 第三节记录的那个坑，也是本任务把它定为
「HTTPS 唯一验收判据」的原因。

## 设计方（公网、独立于本机）复核的客观部分

| 请求 | 结果 |
|---|---|
| `/health` | **200** `{"status":"ok"}` |
| `/` | **200**，19,833 B，`<title>天气 · Weather</title>`，**18 个 `?v=<hash>` 引用** |
| `/css/style.css` | 200，50,666 B |
| `/js/main.js` | 200，7,286 B |
| `/vendor/three.module.js` | 200，1,314,681 B |
| `/manifest.json` | 200，813 B |
| `/api/wx-params` | 200，309 B |
| `/api/weather?lat=31.2&lon=121.5` | 200，10,904 B（后端可打通 Open-Meteo） |

> 复核方法：设计方本机 DNS 对该域名有**负缓存**（解析失败被记住），
> 改用 `curl --resolve weather.alin061218.online:443:172.67.130.182` **直连 Cloudflare 边缘**。
> 后续解析正常后也可直接用域名请求。

## 基础设施终态

| 项 | 值 |
|---|---|
| 域名 NS | `edward.ns.cloudflare.com` / `lila.ns.cloudflare.com`（**注册局已收录**） |
| 隧道 | `weather-demo`，UUID `d1057273-b4ef-465f-a7c8-30eadee90ee2` |
| 隧道运行方式 | **Windows 服务 `cloudflared`**（`Status=Running`、`StartType=Automatic`） |
| connector ID | `deb17469-d9cd-419d-8520-13e058c97602` |
| 服务 ImagePath | `"C:\Program Files (x86)\cloudflared\cloudflared.exe" --config=C:\Users\Lenovo\.cloudflared\config.yml tunnel run` |
| 源站 | `http://localhost:3001`（PM2 `weather-app`，online） |

**服务化过程中的一处坑（已修，记录备查）**：
`cloudflared service install` 装出来的服务 `ImagePath` **不带任何参数**，
而它以 **LocalSystem** 身份运行、默认在 `C:\Windows\System32\config\systemprofile\.cloudflared\`
找配置 —— 那里没有 `config.yml`，于是服务"在跑但一个连接都不建"，
而网站仍能通过手动窗口访问，**故障被掩盖**。

修法（二选一）：
- ★ **改服务 `ImagePath` 显式指定配置**（本次采用；已实测 SYSTEM 对用户目录有 `FullControl`，无需复制配置文件）：
  ```
  "C:\Program Files (x86)\cloudflared\cloudflared.exe" --config=C:\Users\Lenovo\.cloudflared\config.yml tunnel run
  ```
- 或按 [官方 Windows 服务文档](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/windows/)
  把 `config.yml` / credentials / `cert.pem` 复制到系统 profile 目录。

**验证服务是否真的接管**：`cloudflared tunnel info weather-demo` 应列出该服务的 connector；
**并且必须在关掉所有手动窗口后再验证一次公网可访问**，否则故障会被手动进程掩盖。

## 证据类型说明（诚实标注）

- 上表 HTTP 部分是**设计方从公网实测的客观结果**，可用 `curl` 复现 ✅
- 「自动定位弹出授权」是**作者手持设备的人工观察**，
  **不是字节级可复现的产物** —— 但它恰恰是这个判据唯一成立的证明方式
  （无头浏览器无法代表真实移动端的安全上下文与权限弹窗）⚠️

## 已知限制（不隐藏）

1. **隧道落地节点在洛杉矶**（connector `location=lax05/lax11/lax13`）→ 首次加载约 **3–5 秒**
   （Cloudflare 免费版无中国大陆节点）
2. 出站 **UDP 7844 部分被拦**（预检 `region2` QUIC FAIL）→ cloudflared 回落 `http2`
   （日志出现 `degraded transport`）；实测偶发失败约 1/4，刷新可恢复
3. **本地演示（`http://localhost:3001`）仍是主路径** —— 零延迟、零网络依赖、零故障面
4. 隧道地址为**自定义域名**（固定 ✅），但**临时隧道（trycloudflare）地址每次重启都会变**

## 复现命令

```powershell
# 1) 服务状态
Get-Service cloudflared | Select-Object Status, StartType        # 期望 Running / Automatic

# 2) 连接器
cloudflared tunnel info weather-demo                            # 期望列出 connector

# 3) 本地源站
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:3001/health    # 期望 200

# 4) 公网
curl.exe -s -o NUL -w "%{http_code}`n" https://weather.alin061218.online/health   # 期望 200

# 5) ★ 最终判据（只能人工）
#    手机【关 WiFi，用 4G/5G】打开 https://weather.alin061218.online
#    点「自动定位」→ 浏览器弹出授权 = HTTPS 生效
```
