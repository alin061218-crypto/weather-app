# TASK-014 内容补全与准确性修正

设计理由：明确区分冻雨与普通降雨，把天气时间、日出日落、US AQI 和八类生活建议展示出来；空气质量独立请求并共享同城请求，不影响既有天气竞速；反馈保存完整 SUS 原始答案与版本，便于可复现的可用性评估。

- 修复前基线：`fe1c834`（父提交 `46ec788`）；`before.txt` 为真实前端配固定天气输入的原始输出，两个新增 API 的原始 curl 404 一并固化。基线已修正部分 DESC，尚缺米雪和独立冻雨建议。
- 根因：`resolveCity()` 在英文 IP 城市与坐标不一致时只替换名称，省份仍来自 IP；选城路径原本已同步 admin1。现在名称与省份从同一城市记录归一，并避免给「湖北省」重复加省字。
- 实时 AQI：真实生产 `server.js`、独立 SQLite 测试库、真实 Open-Meteo `/v1/air-quality`，用 `curl.exe --noproxy '*'` 验证 200、缓存和输入校验。采用 US AQI 六级阈值，界面标注标准及 CAMS 来源。数据抓取日期 2026-10-03，数值随接口变化。
- SUS：整体满意度必填；十题量表选填，但不能部分计分。保存 `susAnswers`、`susScore`、`questionnaireVersion=sus-zh-v1`、`scenario`、`adviceAccuracy`、`adviceVersion=task014-v1` 和 `createdAt`。奇数题减1，偶数题用5减答案，合计乘2.5；对 100/50/0 分及缺题/越界输入分别验收。匿名记录不关联账号。
- 生活指数：共享 JSON 含 38 条 / 8 类，规则字段为 id/category/conditions/weight/text/tags/priority。当前只做按类别的优先级查表；TASK-013 的加权求值、冲突消解、解释面板和 legacy 对比仍按其独立任务实现。UV 用日最高值，AQI 用 `us_aqi`；花粉和健康预测未接入，文案注明气象参考。
- 时间戳：显示已存缓存 ts，按天气地点时区格式化；切换单位和缓存重绘不会伪造新更新时间。暖缓存启动会产生不同天气对象，同城 AQI 请求支持多个订阅者，只更新当前对象。
- UI 证据：375 / 768 / 1280 × 1100 的视口图 `viewport-*.png`，完整页面 `home-*.png`，另附反馈、隐私及武昌截图；天气/AQI 为固定输入，反馈写入真实服务与 SQLite。三档检验横向溢出、原生对话框、焦点恢复、SUS 提交与快速回复按钮。截图不是实时天气数据。
- 回归：TASK-018b race 两模式及 latency 原断言；TASK-016c 指纹后端/直连两路径；TASK-015e 键盘三档；TASK-016b 真实命名导出链接；内容哈希检查。历史验收文件未改动，只有已有 TASK-016b preload 对历史资源路径的兼容。
- 未改动：原 CSS、图标、大气背景、温度指纹/图表模块、天气竞速 API 模块和 service worker。新增 air/feedback/life 模块均列入 importmap，版本完全由服务端内容哈希注入。

复现：`node evidence/TASK-014/acceptance.cjs`；回归原始输出见 `regression.txt`，版本检查和模块链接见 `checks.txt`。PowerShell 使用 pwsh 7.6.5。测试数据库、请求临时文件和键盘截图保存在忽略的 `runtime.tmp/` 或 `regression.tmp/`，未提交数据库或密钥。

本机运行限制：原 3001 进程仍使用旧后端，新 AQI 路由返回404。重启旧进程和启动持久预览服务两项操作均被工具自动审批拒绝，原因均为 `blocked by policy`，未执行进程变更。上述 API 200、SQLite 和浏览器验收来自脚本启动的独立生产服务；启动修订后的 `server.js` 后新接口即可生效。
