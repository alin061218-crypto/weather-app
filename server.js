// ===== 天气 App 后端服务 =====
// Express + JWT + SQLite (better-sqlite3)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = 'weather-app';
const JWT_AUDIENCE = 'weather-frontend';

const allowedOrigins = new Set([
    'https://weather.alin061218.online',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
]);

const corsOptions = {
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true
};

const createAuthRateLimit = () => rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后再试' }
});

const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'https:'],
    frameSrc: ["'self'", 'https://embed.windy.com'],
    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
};

if (typeof JWT_SECRET !== 'string' || JWT_SECRET.length < 32) {
    console.error('JWT_SECRET must be set and at least 32 characters long');
    process.exit(1);
}

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
if (!ADMIN_USER || !ADMIN_PASSWORD_HASH) {
    console.error('ADMIN_USER and ADMIN_PASSWORD_HASH must be set');
    process.exit(1);
}
if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(ADMIN_PASSWORD_HASH)) {
    console.error('ADMIN_PASSWORD_HASH must be a valid bcrypt hash');
    process.exit(1);
}

// Railway Volume 持久化路径（容器重启后数据不丢失）
// Railway 卷挂载到 /data，本地开发用 ./data/
const DB_ROOT = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
const DB_PATH = process.env.DB_DIR || path.join(DB_ROOT, 'db');
const DB_FILE = path.join(DB_PATH, 'weather.db');

// ===== 初始化数据目录和数据库 =====
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        TEXT PRIMARY KEY,
    username  TEXT NOT NULL UNIQUE,
    password  TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS favorites (
    id        TEXT PRIMARY KEY,
    userId    TEXT NOT NULL,
    name      TEXT NOT NULL,
    admin1    TEXT DEFAULT '',
    country   TEXT DEFAULT '',
    lat       REAL NOT NULL,
    lon       REAL NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS history (
    id      TEXT PRIMARY KEY,
    userId  TEXT NOT NULL,
    city    TEXT NOT NULL,
    lat     REAL,
    lon     REAL,
    weather TEXT DEFAULT '',
    time    TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS cache (
    key  TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    time INTEGER NOT NULL
  );
`);

// 预编译语句
const stmt = {
  // users
  userByUsername:  db.prepare('SELECT * FROM users WHERE username = ?'),
  userById:        db.prepare('SELECT id, username, createdAt FROM users WHERE id = ?'),
  userInsert:      db.prepare('INSERT INTO users (id, username, password, createdAt) VALUES (?, ?, ?, ?)'),
  userAll:         db.prepare('SELECT id, username, createdAt FROM users ORDER BY createdAt DESC'),
  userUpdateName:  db.prepare('UPDATE users SET username = ? WHERE id = ?'),
  userDelete:      db.prepare('DELETE FROM users WHERE id = ?'),

  // favorites
  favByUser:       db.prepare('SELECT * FROM favorites WHERE userId = ? ORDER BY createdAt DESC'),
  favCheck:        db.prepare('SELECT id FROM favorites WHERE userId = ? AND ABS(lat - ?) < 0.01 AND ABS(lon - ?) < 0.01'),
  favInsert:       db.prepare('INSERT INTO favorites (id, userId, name, admin1, country, lat, lon, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  favDelete:       db.prepare('DELETE FROM favorites WHERE id = ? AND userId = ?'),
  favDeleteByUser: db.prepare('DELETE FROM favorites WHERE userId = ?'),
  favDeleteById:   db.prepare('DELETE FROM favorites WHERE id = ?'),
  favAll:          db.prepare('SELECT * FROM favorites ORDER BY createdAt DESC'),
  favCount:        db.prepare('SELECT COUNT(*) AS n FROM favorites'),

  // history
  histByUser:      db.prepare('SELECT * FROM history WHERE userId = ? ORDER BY time DESC LIMIT ?'),
  histInsert:      db.prepare('INSERT INTO history (id, userId, city, lat, lon, weather, time) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  histCount:       db.prepare('SELECT COUNT(*) AS n FROM history WHERE userId = ?'),
  histOldest:      db.prepare('SELECT id FROM history WHERE userId = ? ORDER BY time ASC LIMIT ?'),
  histDeleteById:  db.prepare('DELETE FROM history WHERE id = ?'),
  histDeleteByUser:db.prepare('DELETE FROM history WHERE userId = ?'),
  histAll:         db.prepare('SELECT * FROM history ORDER BY time DESC'),

  // cache
  cacheGet:        db.prepare('SELECT * FROM cache WHERE key = ?'),
  cacheSet:        db.prepare('INSERT OR REPLACE INTO cache (key, data, time) VALUES (?, ?, ?)'),
  cacheClear:      db.prepare('DELETE FROM cache'),
  cacheAll:        db.prepare('SELECT * FROM cache'),
  cacheCount:      db.prepare('SELECT COUNT(*) AS n FROM cache'),

  // stats
  userCount:       db.prepare('SELECT COUNT(*) AS n FROM users'),
  histCountAll:    db.prepare('SELECT COUNT(*) AS n FROM history'),
};

const deleteHistoryRows = db.transaction(rows => {
    for (const row of rows) stmt.histDeleteById.run(row.id);
});

// ===== 中间件 =====
app.use(helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    referrerPolicy: { policy: 'no-referrer' }
}));
app.use('/api', cors(corsOptions));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'frontend'), { dotfiles: 'deny' }));

// ===== JWT 认证中间件 =====
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '请先登录' });
    try {
        const payload = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        });
        const user = stmt.userById.get(payload.id);
        if (!user) return res.status(401).json({ error: '用户不存在或已注销' });
        req.user = { ...payload, username: user.username };
        next();
    } catch {
        res.status(401).json({ error: '登录已过期，请重新登录' });
    }
}

// ===== 1. 用户注册 =====
app.post('/api/register', createAuthRateLimit(), async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: '格式错误' });
    if (username.length < 2 || username.length > 30) return res.status(400).json({ error: '用户名2-30位' });
    if (password.length < 6 || password.length > 100) return res.status(400).json({ error: '密码6-100位' });
    if (!/^[a-zA-Z0-9_一-龥]+$/.test(username)) return res.status(400).json({ error: '用户名只能包含中英文、数字和下划线' });

    if (stmt.userByUsername.get(username)) return res.status(400).json({ error: '用户名已存在' });

    const hashed = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    stmt.userInsert.run(id, username, hashed, new Date().toISOString());

    const token = jwt.sign({ id, username }, JWT_SECRET, {
        expiresIn: '7d',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
    });
    res.json({ token, user: { id, username } });
});

// ===== 2. 用户登录 =====
app.post('/api/login', createAuthRateLimit(), async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名密码不能为空' });
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: '格式错误' });
    if (username.length > 30 || password.length > 100) return res.status(400).json({ error: '输入过长' });

    const user = stmt.userByUsername.get(username);
    if (!user) return res.status(400).json({ error: '用户名或密码错误' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: '用户名或密码错误' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
        expiresIn: '7d',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
    });
    res.json({ token, user: { id: user.id, username: user.username } });
});

// ===== 3. 天气 API 代理（带缓存） =====
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const IP_API = 'https://ipapi.co/json/';
// Canonical weather contract. Keep this synchronized with frontend/js/main.js WX_PARAMS;
// the frontend normally reads this value through /api/wx-params before direct fallback.
const WEATHER_PARAMS = 'current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover,apparent_temperature,uv_index,precipitation_probability,pressure_msl,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=7';

app.get('/api/wx-params', (_req, res) => res.type('text/plain').send(WEATHER_PARAMS));

app.get('/api/weather', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: '缺少经纬度参数' });
    const latNum = parseFloat(lat), lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
        return res.status(400).json({ error: '经纬度格式错误' });
    }

    const cacheKey = latNum.toFixed(2) + ',' + lonNum.toFixed(2);

    try {
        const cached = stmt.cacheGet.get(cacheKey);
        if (cached && Date.now() - cached.time < 600000) {
            return res.json(JSON.parse(cached.data));
        }
        const r = await fetch(`${WEATHER_API}?latitude=${latNum}&longitude=${lonNum}&${WEATHER_PARAMS}`, {
            signal: AbortSignal.timeout(8000)
        });
        if (!r.ok) throw new Error(`Weather API returned ${r.status}`);
        const data = await r.json();
        stmt.cacheSet.run(cacheKey, JSON.stringify(data), Date.now());
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: '天气数据获取失败' });
    }
});

// IP 定位代理
app.get('/api/location', async (req, res) => {
    const forwardedFor = req.get('x-forwarded-for');
    const clientIp = forwardedFor?.split(',')[0]?.trim();
    try {
        const locationUrl = clientIp ? `https://ipapi.co/${encodeURIComponent(clientIp)}/json/` : IP_API;
        const r = await fetch(locationUrl, { signal: AbortSignal.timeout(5000) });
        const d = await r.json();
        if (d.error) throw new Error(d.reason || 'ipapi error');
        res.json({ city: d.city, region: d.region, country: d.country_name, lat: d.latitude, lon: d.longitude });
    } catch {
        // ipapi 失败尝试 ip-api.com
        try {
            const fallbackUrl = clientIp ? `https://ip-api.com/json/${encodeURIComponent(clientIp)}` : 'https://ip-api.com/json/';
            const r2 = await fetch(fallbackUrl, { signal: AbortSignal.timeout(5000) });
            const d2 = await r2.json();
            if (d2.status === 'success') {
                return res.json({ city: d2.city, region: d2.regionName, country: d2.country, lat: d2.lat, lon: d2.lon });
            }
        } catch {}
        res.status(500).json({ error: '定位失败' });
    }
});

// 城市搜索代理
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (q === undefined) return res.json([]);
    if (typeof q !== 'string' || q.length > 64) return res.status(400).json({ error: '搜索词格式错误' });
    if (!q.trim()) return res.json([]);
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
    const favs = stmt.favByUser.all(req.user.id);
    res.json(favs);
});

app.post('/api/favorites', authMiddleware, (req, res) => {
    const { name, admin1, country, lat, lon } = req.body;
    const validText = (value, maxLength) => value == null || (typeof value === 'string' && value.length <= maxLength);
    const validCoordinates = Number.isFinite(lat) && Number.isFinite(lon)
        && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    if (typeof name !== 'string' || !name.trim() || !validText(name, 128)
        || !validText(admin1, 128) || !validText(country, 128) || !validCoordinates) {
        return res.status(400).json({ error: '收藏信息格式错误' });
    }

    if (stmt.favCheck.get(req.user.id, lat, lon)) {
        return res.status(400).json({ error: '已收藏过该城市' });
    }

    const fav = { id: crypto.randomUUID(), userId: req.user.id, name, admin1: admin1 || '', country: country || '', lat, lon, createdAt: new Date().toISOString() };
    stmt.favInsert.run(fav.id, fav.userId, fav.name, fav.admin1, fav.country, fav.lat, fav.lon, fav.createdAt);
    res.json(fav);
});

app.delete('/api/favorites/:id', authMiddleware, (req, res) => {
    const r = stmt.favDelete.run(req.params.id, req.user.id);
    if (r.changes === 0) return res.status(404).json({ error: '收藏不存在' });
    res.json({ success: true });
});

// ===== 5. 查询历史 =====
app.get('/api/history', authMiddleware, (req, res) => {
    const history = stmt.histByUser.all(req.user.id, 20);
    res.json(history);
});

app.post('/api/history', authMiddleware, (req, res) => {
    const { city, lat, lon, weather } = req.body;
    const validCoordinates = Number.isFinite(lat) && Number.isFinite(lon)
        && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    if (typeof city !== 'string' || !city.trim() || city.length > 64 || !validCoordinates) {
        return res.status(400).json({ error: '历史记录格式错误' });
    }
    if (weather != null && typeof weather !== 'string') {
        return res.status(400).json({ error: '天气描述格式错误' });
    }

    const id = crypto.randomUUID();
    stmt.histInsert.run(id, req.user.id, city, lat, lon, weather || '', new Date().toISOString());

    // 每用户保留最近 100 条
    const cnt = stmt.histCount.get(req.user.id);
    if (cnt.n > 100) {
        const old = stmt.histOldest.all(req.user.id, cnt.n - 100);
        deleteHistoryRows(old);
    }

    res.json({ success: true });
});

// 清除当前用户全部搜索历史
app.delete('/api/history', authMiddleware, (req, res) => {
    stmt.histDeleteByUser.run(req.user.id);
    res.json({ success: true });
});

// ===== 6. 获取当前用户信息 =====
app.get('/api/me', authMiddleware, (req, res) => {
    res.json({ user: req.user });
});

// ===== 7. 数据后台管理 =====
const ADMIN_CREDENTIALS = { username: ADMIN_USER, passwordHash: ADMIN_PASSWORD_HASH };
const ADMIN_TOKENS = new Map();
const ADMIN_TOKEN_TTL_MS = 60 * 60 * 1000;

function constantTimeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAdminTokenValid(token) {
    const expiresAt = ADMIN_TOKENS.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
        ADMIN_TOKENS.delete(token);
        return false;
    }
    return true;
}

function getCookie(req, name) {
    const prefix = `${name}=`;
    const cookie = (req.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
    if (!cookie) return undefined;
    try {
        return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
        return undefined;
    }
}

function getAdminToken(req) {
    const authorization = req.get('Authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match?.[1] || getCookie(req, 'admin_token');
}

function adminAuth(req, res, next) {
    const token = getAdminToken(req);
    if (!token || !isAdminTokenValid(token)) {
        return res.status(401).json({ error: '未授权' });
    }
    next();
}

app.post('/api/admin-login', createAuthRateLimit(), async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ error: '用户名密码不能为空' });
    }
    const usernameMatches = constantTimeEqual(username, ADMIN_CREDENTIALS.username);
    const candidateHash = await bcrypt.hash(password, ADMIN_CREDENTIALS.passwordHash.slice(0, 29));
    const passwordMatches = constantTimeEqual(candidateHash, ADMIN_CREDENTIALS.passwordHash);
    if (usernameMatches && passwordMatches) {
        const token = crypto.randomBytes(32).toString('hex');
        ADMIN_TOKENS.set(token, Date.now() + ADMIN_TOKEN_TTL_MS);
        res.cookie('admin_token', token, {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: ADMIN_TOKEN_TTL_MS,
            path: '/admin'
        });
        return res.json({ token });
    }
    res.status(401).json({ error: '用户名或密码错误' });
});

// Admin 后台页面只返回固定骨架，所有数据库值由客户端以 textContent 渲染。
function sendAdminPage(res) {
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
input[type=text]{background:rgba(255,255,255,.08);border:1px solid #444;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;width:80px}
.error{color:#e09090;font-size:13px;margin:8px 0}</style></head><body>
<h1>📊 数据后台管理 (SQLite)</h1>
<button id="clear-cache" type="button" style="background:#e8b86d;color:#1a1a2e;font-weight:600;padding:8px 16px">清空天气缓存</button>
<p id="error" class="error" role="alert"></p>
<div>
<div class="stat"><div id="user-count" class="stat-num">0</div><div class="stat-label">注册用户</div></div>
<div class="stat"><div id="favorite-count" class="stat-num">0</div><div class="stat-label">收藏记录</div></div>
<div class="stat"><div id="history-count" class="stat-num">0</div><div class="stat-label">查询历史</div></div>
<div class="stat"><div id="cache-count" class="stat-num">0</div><div class="stat-label">天气缓存</div></div>
</div>
<h2>👥 用户管理</h2>
<table><thead><tr><th>ID</th><th>用户名</th><th>注册时间</th><th>操作</th></tr></thead><tbody id="users"></tbody></table>
<h2>⭐ 收藏管理</h2>
<table><thead><tr><th>ID</th><th>城市</th><th>省份</th><th>用户ID</th><th>时间</th><th>操作</th></tr></thead><tbody id="favorites"></tbody></table>
<h2>📋 历史记录</h2>
<table><thead><tr><th>ID</th><th>城市</th><th>天气</th><th>用户</th><th>时间</th><th>操作</th></tr></thead><tbody id="history"></tbody></table>
<script>
const $ = id => document.getElementById(id);
function setError(message) { $('error').textContent = message || ''; }
async function api(url, method, body) {
    const options = {method, credentials: 'same-origin', headers: {}};
    if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '请求失败');
    return data;
}
function addTextCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value == null ? '' : String(value);
    row.appendChild(cell);
    return cell;
}
function addActionCell(row, label, handler) {
    const cell = document.createElement('td');
    const button = document.createElement('button');
    button.className = 'btn-del';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', handler);
    cell.appendChild(button);
    row.appendChild(cell);
}
function showEmpty(tbody, colspan, message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = colspan;
    cell.textContent = message;
    row.appendChild(cell);
    tbody.appendChild(row);
}
function renderUsers(users) {
    const tbody = $('users');
    tbody.replaceChildren();
    if (!users.length) return showEmpty(tbody, 4, '暂无用户');
    users.forEach(user => {
        const row = document.createElement('tr');
        addTextCell(row, String(user.id).slice(-6));
        const nameCell = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = user.username || '';
        input.addEventListener('change', async () => {
            try { await api('/admin/users/' + encodeURIComponent(user.id), 'PUT', {username: input.value}); await loadOverview(); }
            catch (error) { setError(error.message); }
        });
        nameCell.appendChild(input);
        row.appendChild(nameCell);
        addTextCell(row, new Date(user.createdAt).toLocaleString());
        addActionCell(row, '删除', async () => {
            if (!confirm('确认删除此用户及相关数据?')) return;
            try { await api('/admin/users/' + encodeURIComponent(user.id), 'DELETE'); await loadOverview(); }
            catch (error) { setError(error.message); }
        });
        tbody.appendChild(row);
    });
}
function renderFavorites(favorites) {
    const tbody = $('favorites');
    tbody.replaceChildren();
    if (!favorites.length) return showEmpty(tbody, 6, '暂无收藏');
    favorites.forEach(favorite => {
        const row = document.createElement('tr');
        addTextCell(row, String(favorite.id).slice(-6));
        addTextCell(row, favorite.name);
        addTextCell(row, favorite.admin1 || '');
        addTextCell(row, String(favorite.userId).slice(-6));
        addTextCell(row, new Date(favorite.createdAt).toLocaleString());
        addActionCell(row, '删除', async () => {
            if (!confirm('确认删除?')) return;
            try { await api('/admin/favorites/' + encodeURIComponent(favorite.id), 'DELETE'); await loadOverview(); }
            catch (error) { setError(error.message); }
        });
        tbody.appendChild(row);
    });
}
function renderHistory(history) {
    const tbody = $('history');
    tbody.replaceChildren();
    const rows = history.slice(-30).reverse();
    if (!rows.length) return showEmpty(tbody, 6, '暂无记录');
    rows.forEach(item => {
        const row = document.createElement('tr');
        addTextCell(row, String(item.id).slice(-6));
        addTextCell(row, item.city);
        addTextCell(row, String(item.weather || '').substring(0, 20));
        addTextCell(row, String(item.userId || '').slice(-6));
        addTextCell(row, new Date(item.time).toLocaleString());
        addActionCell(row, '删除', async () => {
            if (!confirm('确认删除?')) return;
            try { await api('/admin/history/' + encodeURIComponent(item.id), 'DELETE'); await loadOverview(); }
            catch (error) { setError(error.message); }
        });
        tbody.appendChild(row);
    });
}
async function loadOverview() {
    try {
        setError('');
        const data = await api('/admin/api/overview', 'GET');
        $('user-count').textContent = data.users.length;
        $('favorite-count').textContent = data.favorites.length;
        $('history-count').textContent = data.history.length;
        $('cache-count').textContent = data.cacheCount;
        renderUsers(data.users);
        renderFavorites(data.favorites);
        renderHistory(data.history);
    } catch (error) { setError(error.message); }
}
$('clear-cache').addEventListener('click', async () => {
    if (!confirm('确认清空所有天气缓存?')) return;
    try { await api('/admin/clear-cache', 'POST'); await loadOverview(); }
    catch (error) { setError(error.message); }
});
loadOverview();
</script></body></html>`;
    res.send(html);
}

app.get('/admin/api/overview', adminAuth, (req, res) => {
    res.json({
        users: stmt.userAll.all(),
        favorites: stmt.favAll.all(),
        history: stmt.histAll.all(),
        cacheCount: stmt.cacheCount.get().n
    });
});

app.get('/admin', (req, res) => {
    if (req.query.token) return res.redirect('/admin');
    if (isAdminTokenValid(getAdminToken(req))) {
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
if(r.ok){location.href='/admin'}else{document.getElementById('errMsg').textContent=d.error}
});
</script></body></html>`);
});

// Admin API: 删除用户（级联删除收藏和历史）
app.delete('/admin/users/:id', adminAuth, (req, res) => {
    stmt.favDeleteByUser.run(req.params.id);
    stmt.histDeleteByUser.run(req.params.id);
    stmt.userDelete.run(req.params.id);
    res.json({ success: true });
});

// Admin API: 修改用户
app.put('/admin/users/:id', adminAuth, (req, res) => {
    const username = req.body?.username;
    if (username !== undefined) {
        if (typeof username !== 'string' || username.length < 2 || username.length > 30) {
            return res.status(400).json({ error: '用户名2-30位' });
        }
        if (!/^[a-zA-Z0-9_一-龥]+$/.test(username)) {
            return res.status(400).json({ error: '用户名只能包含中英文、数字和下划线' });
        }
        const existing = stmt.userByUsername.get(username);
        if (existing && existing.id !== req.params.id) return res.json({ error: '用户名重复' });
        stmt.userUpdateName.run(username, req.params.id);
    }
    res.json({ success: true });
});

// Admin API: 删除收藏
app.delete('/admin/favorites/:id', adminAuth, (req, res) => {
    stmt.favDeleteById.run(req.params.id);
    res.json({ success: true });
});

// Admin API: 删除历史
app.delete('/admin/history/:id', adminAuth, (req, res) => {
    stmt.histDeleteById.run(req.params.id);
    res.json({ success: true });
});

// Admin API: 清空缓存
app.post('/admin/clear-cache', adminAuth, (req, res) => {
    stmt.cacheClear.run();
    res.json({ success: true });
});

app.use((err, req, res, next) => {
    console.error(err?.stack || err);
    if (res.headersSent) return next(err);
    const status = err?.status || err?.statusCode || 500;
    res.status(status).json({ error: status >= 500 ? '服务器内部错误' : (err?.message || '请求无效') });
});

// ===== 启动服务器 =====
app.listen(PORT, () => {
    console.log(`天气后端服务已启动: http://localhost:${PORT} (SQLite)`);
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
