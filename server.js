// ===== 天气 App 后端服务 =====
// Express + JWT + JSON 文件存储
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'weather_app_secret_key_2024';
const DB_PATH = path.join(__dirname, 'data');

// ===== 初始化数据目录 =====
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });

// 数据库文件路径
const USERS_FILE = path.join(DB_PATH, 'users.json');
const FAVORITES_FILE = path.join(DB_PATH, 'favorites.json');
const HISTORY_FILE = path.join(DB_PATH, 'history.json');
const CACHE_FILE = path.join(DB_PATH, 'weather_cache.json');

// ===== JSON 文件读写工具 =====
function readJSON(filepath) {
    try { return JSON.parse(fs.readFileSync(filepath, 'utf-8')); }
    catch { return null; }
}
function writeJSON(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

// 初始化空数据库
if (!readJSON(USERS_FILE)) writeJSON(USERS_FILE, []);
if (!readJSON(FAVORITES_FILE)) writeJSON(FAVORITES_FILE, []);
if (!readJSON(HISTORY_FILE)) writeJSON(HISTORY_FILE, []);
if (!readJSON(CACHE_FILE)) writeJSON(CACHE_FILE, {});

// ===== 中间件 =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ===== JWT 认证中间件 =====
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '请先登录' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: '登录已过期，请重新登录' });
    }
}

// ===== 1. 用户注册 =====
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: '格式错误' });
    if (username.length < 2 || username.length > 30) return res.status(400).json({ error: '用户名2-30位' });
    if (password.length < 6 || password.length > 100) return res.status(400).json({ error: '密码6-100位' });
    if (!/^[a-zA-Z0-9_一-龥]+$/.test(username)) return res.status(400).json({ error: '用户名只能包含中英文、数字和下划线' });

    const users = readJSON(USERS_FILE);
    if (users.find(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });

    const hashed = await bcrypt.hash(password, 10);
    const user = { id: Date.now().toString(), username, password: hashed, createdAt: new Date().toISOString() };
    users.push(user);
    writeJSON(USERS_FILE, users);

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
});

// ===== 2. 用户登录 =====
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名密码不能为空' });
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: '格式错误' });
    if (username.length > 30 || password.length > 100) return res.status(400).json({ error: '输入过长' });
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: '用户名或密码错误' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: '用户名或密码错误' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
});

// ===== 3. 天气 API 代理（带缓存） =====
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const IP_API = 'https://ipapi.co/json/';

app.get('/api/weather', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: '缺少经纬度参数' });
    // 验证经纬度格式
    const latNum = parseFloat(lat), lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
        return res.status(400).json({ error: '经纬度格式错误' });
    }

    // 检查缓存（10分钟有效）
    const cache = readJSON(CACHE_FILE) || {};
    const cacheKey = latNum.toFixed(2) + ',' + lonNum.toFixed(2);
    if (cache[cacheKey] && Date.now() - cache[cacheKey].time < 600000) {
        return res.json(cache[cacheKey].data);
    }

    try {
        const params = 'current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover,apparent_temperature,uv_index,precipitation_probability,pressure_msl,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_hours=24&forecast_days=7';
        const r = await fetch(`${WEATHER_API}?latitude=${lat}&longitude=${lon}&${params}`);
        const data = await r.json();
        // 保存缓存
        cache[cacheKey] = { time: Date.now(), data };
        writeJSON(CACHE_FILE, cache);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: '天气数据获取失败' });
    }
});

// IP 定位代理
app.get('/api/location', async (req, res) => {
    try {
        const r = await fetch(IP_API);
        const d = await r.json();
        res.json({ city: d.city, region: d.region, country: d.country_name, lat: d.latitude, lon: d.longitude });
    } catch {
        res.status(500).json({ error: '定位失败' });
    }
});

// 城市搜索代理
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
        const r = await fetch(`${GEO_API}?name=${encodeURIComponent(q)}&count=5&language=zh&format=json`);
        const d = await r.json();
        res.json((d.results || []).map(x => ({ name: x.name, admin1: x.admin1, country: x.country, lat: x.latitude, lon: x.longitude })));
    } catch {
        res.json([]);
    }
});

// ===== 4. 收藏城市 =====
app.get('/api/favorites', authMiddleware, (req, res) => {
    const favs = readJSON(FAVORITES_FILE);
    res.json(favs.filter(f => f.userId === req.user.id));
});

app.post('/api/favorites', authMiddleware, (req, res) => {
    const { name, admin1, country, lat, lon } = req.body;
    if (!name || lat == null || lon == null) return res.status(400).json({ error: '缺少城市信息' });

    const favs = readJSON(FAVORITES_FILE);
    // 检查是否已收藏
    if (favs.find(f => f.userId === req.user.id && Math.abs(f.lat - lat) < 0.01 && Math.abs(f.lon - lon) < 0.01)) {
        return res.status(400).json({ error: '已收藏过该城市' });
    }

    const fav = { id: Date.now().toString(), userId: req.user.id, name, admin1, country, lat, lon, createdAt: new Date().toISOString() };
    favs.push(fav);
    writeJSON(FAVORITES_FILE, favs);
    res.json(fav);
});

app.delete('/api/favorites/:id', authMiddleware, (req, res) => {
    let favs = readJSON(FAVORITES_FILE);
    const idx = favs.findIndex(f => f.id === req.params.id && f.userId === req.user.id);
    if (idx === -1) return res.status(404).json({ error: '收藏不存在' });
    favs.splice(idx, 1);
    writeJSON(FAVORITES_FILE, favs);
    res.json({ success: true });
});

// ===== 5. 查询历史 =====
app.get('/api/history', authMiddleware, (req, res) => {
    const history = readJSON(HISTORY_FILE);
    res.json(history.filter(h => h.userId === req.user.id).slice(-20).reverse());
});

app.post('/api/history', authMiddleware, (req, res) => {
    const { city, lat, lon, weather } = req.body;
    const history = readJSON(HISTORY_FILE);
    history.push({ id: Date.now().toString(), userId: req.user.id, city, lat, lon, weather: weather || '', time: new Date().toISOString() });
    // 保留最近 100 条（仅该用户）
    const userHistory = history.filter(h => h.userId === req.user.id);
    if (userHistory.length > 100) {
        const toRemove = userHistory.slice(0, userHistory.length - 100);
        toRemove.forEach(h => { const idx = history.findIndex(x => x.id === h.id); if (idx !== -1) history.splice(idx, 1); });
    }
    writeJSON(HISTORY_FILE, history);
    res.json({ success: true });
});

// 清除当前用户全部搜索历史
app.delete('/api/history', authMiddleware, (req, res) => {
    let history = readJSON(HISTORY_FILE);
    history = history.filter(h => h.userId !== req.user.id);
    writeJSON(HISTORY_FILE, history);
    res.json({ success: true });
});

// ===== 6. 获取当前用户信息 =====
app.get('/api/me', authMiddleware, (req, res) => {
    res.json({ user: req.user });
});

// ===== 7. 数据后台管理 =====
const ADMIN_CREDENTIALS = { username: 'admin', password: 'weather2024' };
const ADMIN_TOKENS = new Map();

// Admin 登录 API
app.post('/api/admin-login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名密码不能为空' });
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        const token = 'admin_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        ADMIN_TOKENS.set(token, Date.now());
        return res.json({ token });
    }
    res.status(401).json({ error: '用户名或密码错误' });
});

// Admin 后台页面渲染函数
function sendAdminPage(res) {
    const users = readJSON(USERS_FILE) || [];
    const favs = readJSON(FAVORITES_FILE) || [];
    const history = readJSON(HISTORY_FILE) || [];
    const cache = readJSON(CACHE_FILE) || {};

    const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>数据后台管理</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:20px;max-width:1000px;margin:0 auto}
h2{color:#e8b86d;margin-top:30px;border-bottom:1px solid #333;padding-bottom:8px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px;background:rgba(255,255,255,.03);border-radius:8px;overflow:hidden}
th{background:rgba(255,255,255,.08);padding:8px 10px;text-align:left;font-weight:600}
td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.05)}
tr:hover{background:rgba(255,255,255,.04)}
.stat{display:inline-block;background:rgba(255,255,255,.06);padding:12px 20px;margin:6px;border-radius:10px;text-align:center}
.stat-num{font-size:28px;font-weight:700;color:#e8b86d}.stat-label{font-size:11px;color:#888;margin-top:4px}
button{padding:4px 10px;border-radius:6px;border:none;cursor:pointer;font-size:12px;margin:0 2px}
.btn-del{background:#c0392b;color:#fff}.btn-del:hover{background:#e74c3c}
.btn-edit{background:#2980b9;color:#fff}.btn-save{background:#27ae60;color:#fff}
input[type=text]{background:rgba(255,255,255,.08);border:1px solid #444;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;width:80px}
.refresh{color:#81d4fa;font-size:12px;float:right}</style></head><body>
<h1>📊 数据后台管理</h1>
<button onclick="clearCache()" style="background:#e8b86d;color:#1a1a2e;font-weight:600;padding:8px 16px">清空天气缓存</button>
<div>
<div class="stat"><div class="stat-num">${users.length}</div><div class="stat-label">注册用户</div></div>
<div class="stat"><div class="stat-num">${favs.length}</div><div class="stat-label">收藏记录</div></div>
<div class="stat"><div class="stat-num">${history.length}</div><div class="stat-label">查询历史</div></div>
<div class="stat"><div class="stat-num">${Object.keys(cache).length}</div><div class="stat-label">天气缓存</div></div>
</div>
<h2>👥 用户管理</h2>
<table><tr><th>ID</th><th>用户名</th><th>密码(哈希)</th><th>注册时间</th><th>操作</th></tr>
${users.map((u,i) => `<tr>
<td>${u.id.slice(-6)}</td>
<td><input type="text" value="${u.username}" onchange="updateUser('${u.id}','username',this.value)" style="width:100px"></td>
<td style="font-size:10px;max-width:120px;overflow:hidden">${u.password}</td>
<td>${new Date(u.createdAt).toLocaleString()}</td>
<td><button class="btn-del" onclick="delUser('${u.id}')">删除</button></td>
</tr>`).join('') || '<tr><td colspan=5>暂无用户</td></tr>'}</table>

<h2>⭐ 收藏管理</h2>
<table><tr><th>ID</th><th>城市</th><th>省份</th><th>用户ID</th><th>时间</th><th>操作</th></tr>
${favs.map((f,i) => `<tr>
<td>${f.id.slice(-6)}</td>
<td>${f.name}</td><td>${f.admin1||''}</td><td>${f.userId.slice(-6)}</td>
<td>${new Date(f.createdAt).toLocaleString()}</td>
<td><button class="btn-del" onclick="delFav('${f.id}')">删除</button></td>
</tr>`).join('') || '<tr><td colspan=6>暂无收藏</td></tr>'}</table>

<h2>📋 历史记录</h2>
<table><tr><th>ID</th><th>城市</th><th>天气</th><th>用户</th><th>时间</th><th>操作</th></tr>
${history.slice(-30).reverse().map((h,i) => `<tr>
<td>${h.id.slice(-6)}</td><td>${h.city}</td><td>${(h.weather||'').substring(0,20)}</td>
<td>${(h.userId||'').slice(-6)}</td><td>${new Date(h.time).toLocaleString()}</td>
<td><button class="btn-del" onclick="delHist('${h.id}')">删除</button></td>
</tr>`).join('') || '<tr><td colspan=6>暂无记录</td></tr>'}</table>

<script>
async function api(url, method, body) {
    const r = await fetch(url, {method, headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    return r.json();
}
async function delUser(id) { if(confirm('确认删除此用户及相关数据?')) { await api('/admin/users/'+id,'DELETE'); location.reload(); } }
async function updateUser(id,field,val) { await api('/admin/users/'+id,'PUT',{[field]:val}); }
async function delFav(id) { if(confirm('确认删除?')) { await api('/admin/favorites/'+id,'DELETE'); location.reload(); } }
async function delHist(id) { if(confirm('确认删除?')) { await api('/admin/history/'+id,'DELETE'); location.reload(); } }
async function clearCache() { if(confirm('确认清空所有天气缓存?')) { await api('/admin/clear-cache','POST'); location.reload(); } }
</script></body></html>`;
    res.send(html);
}

// Admin 后台页面（需 token 验证）
app.get('/admin', (req, res) => {
    if (req.query.token && ADMIN_TOKENS.has(req.query.token)) {
        return sendAdminPage(res);
    }
    return res.send(`<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>后台登录</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:rgba(255,255,255,.05);padding:40px;border-radius:16px;text-align:center;border:1px solid rgba(255,255,255,.1)}
input{padding:12px 16px;border-radius:8px;border:1px solid #444;background:rgba(255,255,255,.08);color:#fff;font-size:15px;margin:8px 0;width:220px;display:block}
button{padding:12px 28px;border-radius:8px;border:none;background:#e8b86d;color:#1a1a2e;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px}
.error{color:#e09090;font-size:13px;margin-top:8px}
</style></head><body><div class="box"><h2>🔐 数据后台</h2>
<form id="loginForm"><input type="text" name="username" placeholder="用户名" required><input type="password" name="password" placeholder="密码" required><button type="submit">登录</button></form>
<p class="error" id="errMsg"></p></div>
<script>
document.getElementById('loginForm').addEventListener('submit',async(e)=>{e.preventDefault();
const u=document.querySelector('[name=username]').value,p=document.querySelector('[name=password]').value;
const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
const d=await r.json();
if(d.token){location.href='/admin?token='+d.token}else{document.getElementById('errMsg').textContent=d.error}
});
</script></body></html>`);
});

// Admin API: 删除用户
app.delete('/admin/users/:id', (req, res) => {
    let users = readJSON(USERS_FILE);
    users = users.filter(u => u.id !== req.params.id);
    writeJSON(USERS_FILE, users);
    // 同时删除该用户的收藏和历史
    let favs = readJSON(FAVORITES_FILE); favs = favs.filter(f => f.userId !== req.params.id); writeJSON(FAVORITES_FILE, favs);
    let hist = readJSON(HISTORY_FILE); hist = hist.filter(h => h.userId !== req.params.id); writeJSON(HISTORY_FILE, hist);
    res.json({ success: true });
});

// Admin API: 修改用户
app.put('/admin/users/:id', (req, res) => {
    let users = readJSON(USERS_FILE);
    const u = users.find(u => u.id === req.params.id);
    if (!u) return res.status(404).json({ error: '不存在' });
    if (req.body.username !== undefined) {
        if (users.find(x => x.username === req.body.username && x.id !== req.params.id)) return res.json({ error: '用户名重复' });
        u.username = req.body.username;
    }
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

// Admin API: 删除收藏
app.delete('/admin/favorites/:id', (req, res) => {
    let favs = readJSON(FAVORITES_FILE);
    favs = favs.filter(f => f.id !== req.params.id);
    writeJSON(FAVORITES_FILE, favs);
    res.json({ success: true });
});

// Admin API: 删除历史
app.delete('/admin/history/:id', (req, res) => {
    let hist = readJSON(HISTORY_FILE);
    hist = hist.filter(h => h.id !== req.params.id);
    writeJSON(HISTORY_FILE, hist);
    res.json({ success: true });
});

// Admin API: 清空缓存
app.post('/admin/clear-cache', (req, res) => {
    writeJSON(CACHE_FILE, {});
    res.json({ success: true });
});

// ===== 启动服务器 =====
app.listen(PORT, () => {
    console.log(`天气后端服务已启动: http://localhost:${PORT}`);
    console.log(`API 文档:`);
    console.log(`  POST /api/register  - 注册`);
    console.log(`  POST /api/login     - 登录`);
    console.log(`  GET  /api/weather   - 获取天气(代理)`);
    console.log(`  GET  /api/location  - IP定位(代理)`);
    console.log(`  GET  /api/search    - 城市搜索(代理)`);
    console.log(`  GET/POST/DELETE /api/favorites - 收藏管理`);
    console.log(`  GET/POST/DELETE /api/history - 查询历史`);
    console.log(`  GET  /admin         - 数据后台管理`);
});
