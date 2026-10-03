# TASK-020b：关闭流程与 Windows 验收

执行日期：2026-10-03；Windows，PowerShell 7.6.5，Node v24.16.0。

设计理由：先停止接收连接并排空在途请求，等待最多 5 秒后继续 checkpoint 和关闭数据库，使正常停服后的主库包含已提交数据；第二次信号立即退出，错误路径打印原因并以退出码 1 结束。

## 可重复执行的验收

从 `E:\weather\weather-project` 运行：

```powershell
node evidence/TASK-020b/shutdown.cjs
node evidence/TASK-020b/sigterm-platform.cjs
node --env-file=.env evidence/TASK-020b/backup-regression.cjs
npm run check:versions
node --check server.js
git diff --check
```

`shutdown.cjs` 使用证据目录下被忽略的独立 `.tmp` 目录、随机空闲端口和测试凭据，不读取生产 `.env`，不写生产数据库。注册、登录、收藏、历史、反馈均通过实际 HTTP API 完成。正常停服后只复制主库，再读取该副本核对全部五张表的行数，确认数据确实进入主库。

直接调用测试由 `call-shutdown.cjs` 在子进程里加载完整的原始 `server.js`，只在模块末尾追加函数导出。父进程通过 IPC 发出测试指令，子进程**直接调用原具名函数 `shutdown('test')`**，不发信号、不复制关闭实现、不增加生产测试接口。`observe.cjs` 在实际方法外记录 `server.close` → `wal_checkpoint(TRUNCATE)` → `db.close` 的调用，以及 checkpoint 的 `busy=0` 和关闭后的 `db.open=false`；错误用例只在测试子进程注入异常。

真实 Windows SIGINT 用 `start-console.ps1` 给隔离服务创建隐藏的独立控制台，再通过 Windows `GenerateConsoleCtrlEvent(CTRL_C_EVENT)` 发送真正的 Ctrl+C。辅助发送器只忽略自己的 Ctrl+C，不影响服务处理器。双信号用例先保持一个未完成的 HTTP 请求，等第一个信号开始关闭后立刻发送第二个，从第二次发送起计时，避免首次快速退出导致用例失去意义。没有用 `process.emit()` 或 `Stop-Process` 冒充信号。

| 用例 | 实测结果 |
|---|---|
| 直接调用 `shutdown('test')` | 退出码 0；主库 4,096 → 90,112 B；写入后 WAL 288,432 B，退出后不存在；日志含「已优雅关闭（WAL 已合并）」 |
| 真实 Ctrl+C / SIGINT | 退出码 0；主库 4,096 → 90,112 B；写入后 WAL 288,432 B，退出后不存在；日志含「已优雅关闭（WAL 已合并）」 |
| 仅主库副本行数（两种正常关闭） | users=1，favorites=3，history=3，cache=0，feedback=3 |
| 在途请求 | 停服后新连接被拒绝；已接收的反馈请求完成并入库 1 行，退出码 0 |
| 5 秒硬超时 | 未完成的请求等待 5,030 ms 后继续 checkpoint、close 并以退出码 0 结束 |
| 连续两次真实 SIGINT | 第二次发送后 16 ms 退出；退出码 1；日志含「再次收到 SIGINT，立即退出」 |
| `server.close` / checkpoint / `db.close` 抛错 | 三个用例均打印错误并以退出码 1 结束；前两种仍执行数据库关闭；均不打印成功关闭日志 |
| 隔离测试数据备份 | 未修改的 `npm run backup:db` 生成快照；五张表行数均与测试库一致 |
| 当前仓库数据库备份 | 实际执行原仓库的 `npm run backup:db`；快照 139,264 B；users=0、favorites=0、history=0、cache=7、feedback=0，均与源库一致 |
| 静态与回归检查 | 两个信号处理器、一个 checkpoint、一个捕获实例；TASK-020 两项警告保留；版本检查 PASS: 15；语法、diff 检查退出码 0 |

原始输出在 `after.txt`、`shutdown.json`、`sigterm-platform.txt` 和 `checks.txt`；修复前源码统计和 TASK-020 已有的历史 WAL 实测记录在 `before.txt`。历史记录标明来源，不声称重跑过修复前服务。

## SIGTERM 平台限制

**SIGTERM 的信号投递为平台行为：Windows 无真实信号（实测处理器不触发）。本机已验证关闭流程本身；SIGTERM 投递将在 TASK-010b 选定 Linux 部署目标后实测。**

`sigterm-platform.cjs` 仅使用一个登记了 SIGTERM 处理器的独立小进程确认平台事实：`handlerRan=false`、`childAlive=false`。它不是 `server.js` 的 SIGTERM 验收，本机没有验证服务能接收真实 SIGTERM。`Stop-Process` 即使不带 `-Force` 也不能用于证明 Node 的 SIGTERM 处理器执行。正常停服使用服务控制台的 Ctrl+C。

已停止 Linux/QEMU 搭建，终止下载进程并删除整个 `probe.tmp`（包括 7-Zip、Alpine 下载和 QEMU 索引）；无需 WSL、Docker、虚拟机或额外依赖。

## 部署文档

已修改原文件 `E:\weather\docs\07-域名与内网穿透部署方案.md` 的 8.2 节，说明 Docker `stop_grace_period >= 10s`、PM2 `kill_timeout >= 10000`、避免强杀、Windows Ctrl+C 及 SIGTERM 平台限制。原文档位于 Git 仓库外；本证据目录保存同名完整快照随提交交付，内容与原文件一致。
