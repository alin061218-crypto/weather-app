# TASK-020 数据库迁移记录

执行日期：2026-10-03（Windows / PowerShell）

## 1. 停止服务（Ctrl+C）

迁移前发现两个 `node server.js`：

```text
57248  "C:\Program Files\nodejs\node.exe" server.js
37956  "C:\Program Files\nodejs\node.exe" --env-file=.env server.js
```

分别向两个服务所属控制台发送 Ctrl+C，未使用 `taskkill /F`。退出后复查：

```text
Get-CimInstance Win32_Process ... | Where-Object { $_.CommandLine -match 'server\.js' }
（无输出）
```

## 2. 检查并合并 WAL

Ctrl+C 后原目录仍显示 WAL 未合并，说明原 `server.js` 没有 SIGINT/SIGTERM 关闭处理：

```text
weather.db       4096 B
weather.db-shm  32768 B
weather.db-wal 819912 B
```

确认没有服务进程占用数据库后，执行 SQLite checkpoint：

```text
journal_mode wal
checkpoint [{"busy":0,"log":0,"checkpointed":0}]
users 0
favorites 0
history 0
cache 7
feedback 0
after {"weather.db":139264,"weather.db-wal":null,"weather.db-shm":null}
```

这一步在复制前完成，避免把未合并的 WAL 当作可选文件遗漏。

## 3. 只复制到仓库外目标目录

目标目录：`E:\weather\data\db`。原目录没有移动或删除：

```text
SKIP missing weather.db-wal
SKIP missing weather.db-shm
copied=weather.db
weather.db  139264 B  E:\weather\data\db\weather.db
```

源库和目标库 SHA-256 相同：

```text
6F006640DF767ECABAC4B882DF72DCA12AF8A76EB7EED9F94C67A1A0B65AB5D
6F006640DF767ECABAC4B882DF72DCA12AF8A76EB7EED9F94C67A1A0B65AB5D
```

## 4. 切换 `.env`

```text
DB_DIR=E:\weather\data\db
```

## 5. 启动并确认使用新库

使用新路径、端口 `3999` 启动服务的实际输出包含：

```text
天气后端服务已启动: http://localhost:3999 (SQLite)
```

稳定路径启动没有临时目录警告。直接读取迁移后的库：

```text
cache= 7 feedback= 0
```

## 6. 保留原目录

原目录仍保留，当前内容为：

```text
C:\Users\Lenovo\AppData\Local\Temp\wtest\db\weather.db  139264 B
```

原目录至少保留一周，待作者确认后再删除。

## 启动自检补充实测

把 `DB_DIR` 临时指向 `%TEMP%\task020-warning-db` 时，服务仍启动并输出：

```text
⚠️ 数据库位于临时目录：C:\Users\Lenovo\AppData\Local\Temp\task020-warning-db
系统可能清理该目录导致数据丢失。请把 DB_DIR 指向稳定路径（见 docs TASK-020）。
天气后端服务已启动: http://localhost:3999 (SQLite)
```

用 `10,110,512 B` 的 WAL 启动时还输出：

```text
⚠️ WAL 文件异常大：...\weather.db-wal (10110512 B)，上次可能未正常关闭。
```
