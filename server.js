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
const os = require('os');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const FRONTEND_ROOT = path.join(__dirname, 'frontend');
const THREE_GZIP_FILE = path.join(FRONTEND_ROOT, 'vendor', 'three.module.js.gz');
const INDEX_TEMPLATE = fs.readFileSync(path.join(FRONTEND_ROOT, 'index.html'), 'utf8');
// Match both HTML attributes and JSON importmap values (including every /js module).
const ASSET_REFERENCE = /(["'])((?:\/)?(?:js|css|vendor)\/[^"'?#\s]+)(?:\?[^"'#\s]*)?\1/g;
const assetHashes = new Map();
function assetVersion(url) {
    const file = path.join(FRONTEND_ROOT, url.replace(/^\//, ''));
    const stat = fs.statSync(file);
    const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    if (assetHashes.get(file)?.stamp !== stamp) {
        assetHashes.set(file, { stamp, hash: crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8) });
    }
    return assetHashes.get(file).hash;
}
function renderIndex() {
    const html = INDEX_TEMPLATE.replace(ASSET_REFERENCE, (_match, quote, url) => `${quote}${url}?v=${assetVersion(url)}${quote}`);
    checkModuleReferences(html);
    return html;
}
function checkModuleReferences(html) {
    const match = html.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/);
    if (!match || match.index > html.indexOf('<script type="module"')) throw new Error('Importmap must precede module scripts');
    const imports = JSON.parse(match[1]).imports;
    const modules = fs.readdirSync(path.join(FRONTEND_ROOT, 'js')).filter(file => file.endsWith('.js'));
    const entries = Object.entries(imports).filter(([name]) => name.startsWith('app/'));
    if (entries.length !== modules.length) throw new Error(`Importmap coverage mismatch: ${entries.length}/${modules.length}`);
    for (const file of modules) {
        const name = `app/${file.slice(0, -3)}`;
        const url = `/js/${file}`;
        if (imports[name] !== `${url}?v=${assetVersion(url)}`) throw new Error(`Importmap asset version mismatch: ${name}`);
    }
    const main = html.match(/<script\s+type="module"\s+src="([^"]+)"><\/script>/);
    if (main?.[1] !== imports['app/main']) throw new Error('Main script and importmap versions must match');
    return modules.length;
}
function checkAssetVersions(html) {
    const references = [...html.matchAll(ASSET_REFERENCE)];
    if (!references.length) throw new Error('No index asset references found');
    for (const [reference, , url] of references) {
        const version = new URL(reference.slice(1, -1), 'http://localhost').searchParams.get('v');
        if (version !== assetVersion(url)) throw new Error(`Asset version mismatch: ${url} (${version})`);
    }
    // Count unique application modules; CSS and vendor references are also verified above.
    return checkModuleReferences(html);
}
// Run the guard without starting the service; optionally verify a saved HTTP response.
if (process.argv.includes('--check-asset-versions')) {
    if ([...INDEX_TEMPLATE.matchAll(ASSET_REFERENCE)].some(([reference]) => reference.includes('?'))) {
        throw new Error('Index asset versions must be injected, not hardcoded');
    }
    const html = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : renderIndex();
    console.log(`PASS: ${checkAssetVersions(html)} index asset versions match SHA-1 content hashes`);
    process.exit(0);
}
const HALF_HOUR_MS = 30 * 60 * 1000;
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

function isInside(parent, child) {
    const relative = path.relative(path.resolve(parent), path.resolve(child));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const resolvedDbPath = path.resolve(DB_PATH);
if (isInside(os.tmpdir(), resolvedDbPath)) {
    console.warn(`⚠️ 数据库位于临时目录：${resolvedDbPath}`);
    console.warn('   系统可能清理该目录导致数据丢失。请把 DB_DIR 指向稳定路径（见 docs TASK-020）。');
}
const walFile = `${DB_FILE}-wal`;
if (fs.existsSync(walFile)) {
    const walBytes = fs.statSync(walFile).size;
    if (walBytes > 5 * 1024 * 1024) {
        console.warn(`⚠️ WAL 文件异常大：${walFile} (${walBytes} B)，上次可能未正常关闭。`);
    }
}

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
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    susAnswers TEXT,
    susScore REAL,
    questionnaireVersion TEXT NOT NULL,
    scenario TEXT NOT NULL DEFAULT '',
    adviceAccuracy INTEGER,
    adviceVersion TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_city ON history(city);
  CREATE INDEX IF NOT EXISTS idx_history_time ON history(time);
  CREATE INDEX IF NOT EXISTS idx_history_user ON history(userId);
  CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(userId);
  CREATE INDEX IF NOT EXISTS idx_favorites_admin1 ON favorites(admin1);
`);

// 预编译语句
const stmt = {
  // users
  userByUsername:  db.prepare('SELECT * FROM users WHERE username = ?'),
  userById:        db.prepare('SELECT id, username, createdAt FROM users WHERE id = ?'),
  userInsert:      db.prepare('INSERT INTO users (id, username, password, createdAt) VALUES (?, ?, ?, ?)'),
  userAll:         db.prepare('SELECT id, username, createdAt FROM users ORDER BY createdAt DESC LIMIT 50'),
  userUpdateName:  db.prepare('UPDATE users SET username = ? WHERE id = ?'),
  userDelete:      db.prepare('DELETE FROM users WHERE id = ?'),

  // favorites
  favByUser:       db.prepare('SELECT * FROM favorites WHERE userId = ? ORDER BY createdAt DESC'),
  favCheck:        db.prepare('SELECT id FROM favorites WHERE userId = ? AND ABS(lat - ?) < 0.01 AND ABS(lon - ?) < 0.01'),
  favInsert:       db.prepare('INSERT INTO favorites (id, userId, name, admin1, country, lat, lon, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  favDelete:       db.prepare('DELETE FROM favorites WHERE id = ? AND userId = ?'),
  favDeleteByUser: db.prepare('DELETE FROM favorites WHERE userId = ?'),
  favDeleteById:   db.prepare('DELETE FROM favorites WHERE id = ?'),
  favAll:          db.prepare('SELECT * FROM favorites ORDER BY createdAt DESC LIMIT 50'),
  favCount:        db.prepare('SELECT COUNT(*) AS n FROM favorites'),

  // history
  histByUser:      db.prepare('SELECT * FROM history WHERE userId = ? ORDER BY time DESC LIMIT ?'),
  histInsert:      db.prepare('INSERT INTO history (id, userId, city, lat, lon, weather, time) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  histCount:       db.prepare('SELECT COUNT(*) AS n FROM history WHERE userId = ?'),
  histOldest:      db.prepare('SELECT id FROM history WHERE userId = ? ORDER BY time ASC LIMIT ?'),
  histDeleteById:  db.prepare('DELETE FROM history WHERE id = ?'),
  histDeleteByUser:db.prepare('DELETE FROM history WHERE userId = ?'),
  histAll:         db.prepare('SELECT * FROM history ORDER BY time DESC LIMIT 100'),

  // cache
  cacheGet:        db.prepare('SELECT * FROM cache WHERE key = ?'),
  cacheSet:        db.prepare('INSERT OR REPLACE INTO cache (key, data, time) VALUES (?, ?, ?)'),
  cachePruneLocation: db.prepare("DELETE FROM cache WHERE key LIKE 'ip:%' AND time < ?"),
  cacheClear:      db.prepare('DELETE FROM cache'),
  cacheAll:        db.prepare('SELECT * FROM cache'),
  cacheCount:      db.prepare('SELECT COUNT(*) AS n FROM cache'),

  // stats
  userCount:       db.prepare('SELECT COUNT(*) AS n FROM users'),
  histTotal:       db.prepare('SELECT COUNT(*) AS n FROM history'),
  byCity:         db.prepare('SELECT city, COUNT(*) n FROM history GROUP BY city ORDER BY n DESC LIMIT 10'),
  byDay:          db.prepare('SELECT substr(time,1,10) d, COUNT(*) n FROM history GROUP BY d ORDER BY d DESC LIMIT 14'),
  byProvince:     db.prepare("SELECT admin1, COUNT(*) n FROM favorites WHERE admin1 <> '' GROUP BY admin1 ORDER BY n DESC LIMIT 10"),
};

const deleteHistoryRows = db.transaction(rows => {
    for (const row of rows) stmt.histDeleteById.run(row.id);
});

const feedbackInsert = db.prepare(`INSERT INTO feedback
    (id, rating, comment, susAnswers, susScore, questionnaireVersion, scenario, adviceAccuracy, adviceVersion, createdAt)
    VALUES (@id, @rating, @comment, @susAnswers, @susScore, @questionnaireVersion, @scenario, @adviceAccuracy, @adviceVersion, @createdAt)`);

// ===== 中间件 =====
app.use(helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    referrerPolicy: { policy: 'no-referrer' }
}));
app.use('/api', cors(corsOptions));
app.use(express.json({ limit: '32kb' }));

app.get(['/', '/index.html'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(renderIndex());
});

// The large, versioned Three.js module is precompressed at build time so the
// server does not spend CPU time gzipping it on every request.
// When updating Three.js, regenerate three.module.js.gz AND update the import-map
// ?v= (formerly manual): renderIndex now derives that version from the new JS hash.
app.get('/vendor/three.module.js', (req, res, next) => {
    const acceptEncoding = req.get('accept-encoding') || '';
    if (!/\bgzip\b/i.test(acceptEncoding) || !fs.existsSync(THREE_GZIP_FILE)) return next();
    res.set({
        'Cache-Control': /^[a-f0-9]{8}$/.test(req.query.v || '') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/javascript; charset=UTF-8',
        'Vary': 'Accept-Encoding'
    });
    res.sendFile(THREE_GZIP_FILE, error => {
        if (error && !res.headersSent) next(error);
    });
});

app.use(express.static(FRONTEND_ROOT, {
    dotfiles: 'deny',
    maxAge: '1d',
    setHeaders(res, filePath) {
        const relative = path.relative(FRONTEND_ROOT, filePath).replace(/\\/g, '/');
        if (relative === 'index.html') {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (/^(vendor|css|js)\//.test(relative)) {
            // Unversioned module imports must revalidate, including future split modules.
            res.setHeader('Cache-Control', /^[a-f0-9]{8}$/.test(res.req.query.v || '') ? 'public, max-age=31536000, immutable' : 'no-cache');
        } else if (/^data\//.test(relative)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));

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
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    const timeout = setTimeout(() => controller.abort(), 8000);
    res.on('close', cancel);

    try {
        const cached = stmt.cacheGet.get(cacheKey);
        if (cached && Date.now() - cached.time < HALF_HOUR_MS) {
            return res.json(JSON.parse(cached.data));
        }
        const r = await fetch(`${WEATHER_API}?latitude=${latNum}&longitude=${lonNum}&${WEATHER_PARAMS}`, {
            signal: controller.signal
        });
        if (!r.ok) throw new Error(`Weather API returned ${r.status}`);
        const data = await r.json();
        stmt.cacheSet.run(cacheKey, JSON.stringify(data), Date.now());
        res.json(data);
    } catch (e) {
        if (!res.destroyed) res.status(500).json({ error: '天气数据获取失败' });
    } finally {
        clearTimeout(timeout);
        res.off('close', cancel);
    }
});

// Independent AQI cache namespace: never collide with forecast cache entries.
app.get('/api/air', async (req, res) => {
    const { lat, lon } = req.query;
    const latNum = Number(lat), lonNum = Number(lon);
    if (typeof lat !== 'string' || !lat.trim() || typeof lon !== 'string' || !lon.trim()
        || !Number.isFinite(latNum) || !Number.isFinite(lonNum)
        || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
        return res.status(400).json({ error: '经纬度格式错误' });
    }
    const key = `air:${latNum.toFixed(2)},${lonNum.toFixed(2)}`;
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    const timeout = setTimeout(() => controller.abort(), 8000);
    res.on('close', cancel);
    try {
        const cached = stmt.cacheGet.get(key);
        if (cached && Date.now() - cached.time < HALF_HOUR_MS) return res.json(JSON.parse(cached.data));
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latNum}&longitude=${lonNum}&current=pm10,pm2_5,us_aqi&timezone=auto`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Air API returned ${response.status}`);
        const data = await response.json();
        if (!Number.isFinite(data.current?.us_aqi) || data.current.us_aqi < 0) throw new Error('Invalid AQI');
        stmt.cacheSet.run(key, JSON.stringify(data), Date.now());
        res.json(data);
    } catch {
        if (!res.destroyed) res.status(502).json({ error: '空气质量暂不可用' });
    } finally {
        clearTimeout(timeout);
        res.off('close', cancel);
    }
});

// Anonymous usability feedback; incomplete SUS responses never receive a score.
app.post('/api/feedback', rateLimit({ windowMs: 60000, limit: 20,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: '反馈提交过于频繁，请稍后再试' } }), (req, res) => {
    const body = req.body || {};
    const { rating, comment = '', sus = null, scenario = '', adviceAccuracy = null } = body;
    const likert = value => Number.isInteger(value) && value >= 1 && value <= 5;
    if (!likert(rating) || typeof comment !== 'string' || comment.length > 2000
        || typeof scenario !== 'string' || scenario.length > 120
        || (adviceAccuracy !== null && !likert(adviceAccuracy))
        || (sus !== null && (!Array.isArray(sus) || sus.length !== 10 || !sus.every(likert)))) {
        return res.status(400).json({ error: '评分须为1–5；SUS须完整填写10题；意见不超过2000字' });
    }
    const susScore = sus === null ? null : sus.reduce((sum, value, index) => sum + (index % 2 === 0 ? value - 1 : 5 - value), 0) * 2.5;
    const id = crypto.randomUUID();
    feedbackInsert.run({ id, rating, comment: comment.trim(), susAnswers: sus === null ? null : JSON.stringify(sus),
        susScore, questionnaireVersion: 'sus-zh-v1', scenario: scenario.trim(), adviceAccuracy,
        adviceVersion: 'task014-v1', createdAt: new Date().toISOString() });
    res.json({ ok: true, id, susScore });
});

// IP 定位代理
app.get('/api/location', async (req, res) => {
    const forwardedFor = req.get('x-forwarded-for');
    const clientIp = forwardedFor?.split(',')[0]?.trim();
    const cacheKey = `ip:${clientIp || 'default'}`;
    // Keep expired per-IP entries from accumulating in the shared cache table.
    stmt.cachePruneLocation.run(Date.now() - HALF_HOUR_MS);
    const cached = stmt.cacheGet.get(cacheKey);
    if (cached && Date.now() - cached.time < HALF_HOUR_MS) {
        try {
            res.setHeader('Cache-Control', 'private, max-age=1800');
            return res.json(JSON.parse(cached.data));
        } catch {
            // Ignore malformed legacy rows and refresh from the provider.
        }
    }
    try {
        const locationUrl = clientIp ? `https://ipapi.co/${encodeURIComponent(clientIp)}/json/` : IP_API;
        const r = await fetch(locationUrl, { signal: AbortSignal.timeout(5000) });
        const d = await r.json();
        if (!r.ok || d.error || !d.city || !Number.isFinite(Number(d.latitude)) || !Number.isFinite(Number(d.longitude))) {
            throw new Error(d.reason || 'ipapi error');
        }
        const location = { city: d.city, region: d.region, country: d.country_name, lat: d.latitude, lon: d.longitude };
        stmt.cacheSet.run(cacheKey, JSON.stringify(location), Date.now());
        res.setHeader('Cache-Control', 'private, max-age=1800');
        res.json(location);
    } catch {
        // ipapi 失败尝试 ip-api.com
        try {
            const fallbackUrl = clientIp ? `https://ip-api.com/json/${encodeURIComponent(clientIp)}` : 'https://ip-api.com/json/';
            const r2 = await fetch(fallbackUrl, { signal: AbortSignal.timeout(5000) });
            const d2 = await r2.json();
            if (r2.ok && d2.status === 'success' && d2.city && Number.isFinite(Number(d2.lat)) && Number.isFinite(Number(d2.lon))) {
                const location = { city: d2.city, region: d2.regionName, country: d2.country, lat: d2.lat, lon: d2.lon };
                stmt.cacheSet.run(cacheKey, JSON.stringify(location), Date.now());
                res.setHeader('Cache-Control', 'private, max-age=1800');
                return res.json(location);
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
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>数据后台</title>
<style>
/* 值镜像自 frontend/css/style.css 的 :root，改动请同步 */
:root{--bg:#0a0e17;--surface:#121724;--ink:#eef2f8;--ink-secondary:#aab4c6;--primary:#5b9cf5;--border:rgba(255,255,255,.07);--danger:#e06070;}
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);margin:0;line-height:1.5}
main{max-width:1208px;margin:0 auto;padding:32px}
.topbar,.section-heading,.danger{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
h1{font-size:28px;letter-spacing:-.03em;margin:0}h2{font-size:18px;font-weight:600;margin:0}
.actions{display:flex;gap:8px}button,input{font:inherit}
button{padding:8px 12px;border:1px solid var(--border);background:var(--surface);color:var(--ink);cursor:pointer;border-radius:4px}
button:hover{border-color:var(--primary)}button:active{opacity:.8}button:disabled{opacity:.5;cursor:wait}
#refresh{color:var(--primary)}.btn-del{color:var(--danger)}.btn-del:hover{border-color:var(--danger)}
:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.error{color:var(--danger);font-size:13px;margin:12px 0}.error:empty{display:none}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:24px 0 32px;padding:20px 0}
.stat{min-width:0;text-align:center}.stat-num{font-size:32px;font-weight:600;color:var(--primary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.stat-label{font-size:13px;color:var(--ink-secondary);margin-top:4px}
.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;margin-bottom:32px}
.chart{min-width:0}.chart-note,.table-note,.total,.danger p{font-size:13px;color:var(--ink-secondary)}
.chart-note{margin:12px 0 0}.plot{position:relative;margin-top:16px;height:280px}
canvas{display:block;width:100%;height:100%}.date-labels{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-secondary);gap:8px;margin-top:8px}
.city-labels{position:absolute;inset:0;list-style:none;margin:0;padding:0;pointer-events:none}
.city-labels li{height:28px;display:grid;grid-template-columns:100px minmax(0,1fr) 40px;align-items:center;font-size:13px;gap:8px}
.city-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.city-count{grid-column:3;text-align:right;font-variant-numeric:tabular-nums}
.data-section{margin-top:28px}.section-heading{justify-content:flex-start;gap:12px}.table-note{margin:6px 0 12px}
.table-wrap{max-width:100%;max-height:320px;overflow:auto;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
table{width:100%;min-width:480px;border-collapse:collapse;font-size:13px}table.wide{min-width:700px}
th{position:sticky;top:0;background:var(--surface);padding:10px 12px;text-align:left;font-weight:600;color:var(--ink-secondary)}
td{padding:8px 12px;border-top:1px solid var(--border);overflow-wrap:anywhere;max-width:240px}td:last-child{white-space:nowrap}
tr:hover{background:var(--surface)}td button{padding:4px 10px;font-size:12px}
input[type=text]{background:var(--surface);border:1px solid var(--border);color:var(--ink);padding:6px 8px;border-radius:4px;font-size:13px;width:140px;max-width:100%}
.danger{border-top:1px solid var(--border);margin-top:32px;padding-top:24px}.danger h2{color:var(--danger)}.danger p{margin:6px 0 0}
@media(max-width:767px){main{padding:20px 16px}.topbar{gap:12px}h1{font-size:24px}.actions button{font-size:13px}.stat-num{font-size:24px}.stat-label{font-size:12px}.metrics{padding:16px 0}.charts{grid-template-columns:minmax(0,1fr);gap:28px}.section-heading{gap:8px}}
</style></head><body><main>
<header class="topbar"><h1>数据后台</h1><div class="actions"><button id="refresh" type="button">刷新</button><button id="logout" type="button">退出登录</button></div></header>
<p id="error" class="error" role="alert"></p>
<section class="metrics" aria-label="核心指标">
<div class="stat"><div id="user-count" class="stat-num">—</div><div class="stat-label">注册用户</div></div>
<div class="stat"><div id="favorite-count" class="stat-num">—</div><div class="stat-label">收藏城市</div></div>
<div class="stat"><div id="history-count" class="stat-num">—</div><div class="stat-label">查询记录</div></div>
<div class="stat"><div id="cache-count" class="stat-num">—</div><div class="stat-label">缓存条目</div></div>
</section>
<section class="charts" aria-label="查询统计图表">
<div class="chart"><h2>近 14 天查询趋势</h2><div class="plot"><canvas id="trend-chart" role="img" aria-label="近 14 天查询趋势，正在加载"></canvas></div><div id="date-labels" class="date-labels" aria-hidden="true"></div><p id="trend-summary" class="chart-note">正在加载</p></div>
<div class="chart"><h2>热门城市 Top-10</h2><div class="plot"><canvas id="city-chart" role="img" aria-label="热门城市前十名，正在加载"></canvas><ol id="city-labels" class="city-labels" aria-hidden="true"></ol></div><p class="chart-note">按查询次数排序 · 条形长度表示次数</p></div>
</section>
<section class="data-section" aria-labelledby="users-heading"><div class="section-heading"><h2 id="users-heading">用户</h2><span id="users-total" class="total"></span></div><p class="table-note">显示最新 50 条 · 修改用户名后自动保存</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="用户表，可滚动"><table><thead><tr><th scope="col">ID</th><th scope="col">用户名</th><th scope="col">注册时间</th><th scope="col">操作</th></tr></thead><tbody id="users"></tbody></table></div></section>
<section class="data-section" aria-labelledby="favorites-heading"><div class="section-heading"><h2 id="favorites-heading">收藏</h2><span id="favorites-total" class="total"></span></div><p class="table-note">显示最新 50 条</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="收藏表，可滚动"><table class="wide"><thead><tr><th scope="col">ID</th><th scope="col">城市</th><th scope="col">省份</th><th scope="col">用户 ID</th><th scope="col">时间</th><th scope="col">操作</th></tr></thead><tbody id="favorites"></tbody></table></div></section>
<section class="data-section" aria-labelledby="history-heading"><div class="section-heading"><h2 id="history-heading">查询记录</h2><span id="history-total" class="total"></span></div><p class="table-note">显示最新 30 条 · 按时间从新到旧</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="查询记录表，可滚动"><table class="wide"><thead><tr><th scope="col">ID</th><th scope="col">城市</th><th scope="col">天气</th><th scope="col">用户</th><th scope="col">时间</th><th scope="col">操作</th></tr></thead><tbody id="history"></tbody></table></div></section>
<section class="danger" aria-labelledby="danger-heading"><div><h2 id="danger-heading">危险区</h2><p>清空后，下次天气查询将重新获取数据。</p></div><button id="clear-cache" class="btn-del" type="button">清空天气缓存</button></section>
</main>
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
        input.setAttribute('aria-label', '用户名');
        input.maxLength = 30;
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
    const rows = history.slice(0, 30);
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
let chartStats = null;
function chartSurface(id) {
    const canvas = $(id), width = canvas.clientWidth, height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.font = '12px system-ui, sans-serif';
    const style = getComputedStyle(document.documentElement);
    return {ctx, width, height, primary: style.getPropertyValue('--primary').trim(),
        secondary: style.getPropertyValue('--ink-secondary').trim(), border: style.getPropertyValue('--border').trim()};
}
function drawCharts() {
    if (!chartStats) return;
    const {days, cities} = chartStats;
    const {ctx, width, height, primary, secondary, border} = chartSurface('trend-chart');
    const left = 36, right = width - 12, top = 16, bottom = height - 12;
    const peak = Math.max(0, ...days.map(day => day.n)), ceiling = Math.max(2, Math.ceil(peak / 2) * 2);
    ctx.fillStyle = secondary; ctx.textAlign = 'right';
    for (let tick = 0; tick <= 2; tick++) {
        const y = bottom - (bottom - top) * tick / 2;
        ctx.strokeStyle = border; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        ctx.fillText(String(ceiling * tick / 2), left - 8, y + 4);
    }
    if (days.length) {
        const points = days.map((day, i) => [days.length === 1 ? (left + right) / 2 : left + (right - left) * i / (days.length - 1), bottom - (bottom - top) * day.n / ceiling]);
        ctx.beginPath(); ctx.moveTo(points[0][0], bottom);
        points.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(points[points.length - 1][0], bottom); ctx.closePath();
        ctx.fillStyle = primary; ctx.globalAlpha = .10; ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = primary; ctx.lineWidth = 2; ctx.stroke();
        points.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    } else { ctx.textAlign = 'center'; ctx.fillText('暂无查询记录', (left + right) / 2, height / 2); }
    const bars = chartSurface('city-chart'), max = Math.max(1, ...cities.map(city => city.n));
    bars.ctx.fillStyle = bars.primary;
    cities.forEach((city, i) => bars.ctx.fillRect(108, i * 28 + 7, Math.max(0, bars.width - 156) * city.n / max, 14));
    if (!cities.length) { bars.ctx.fillStyle = bars.secondary; bars.ctx.textAlign = 'center'; bars.ctx.fillText('暂无查询记录', bars.width / 2, bars.height / 2); }
}
function renderStats(stats) {
    const {counts} = stats;
    $('user-count').textContent = counts.users;
    $('favorite-count').textContent = counts.favorites;
    $('history-count').textContent = counts.history;
    $('cache-count').textContent = counts.cache;
    $('users-total').textContent = '共 ' + counts.users + ' 条';
    $('favorites-total').textContent = '共 ' + counts.favorites + ' 条';
    $('history-total').textContent = '共 ' + counts.history + ' 条';
    // API 按日期倒序返回；折线按从旧到新的顺序绘制。
    const days = stats.byDay.slice().reverse(), cities = stats.byCity;
    chartStats = {days, cities};
    const total = days.reduce((sum, day) => sum + day.n, 0), peak = Math.max(0, ...days.map(day => day.n));
    $('trend-summary').textContent = '总计 ' + total + ' 次、峰值 ' + peak + ' 次';
    $('trend-chart').setAttribute('aria-label', '近 14 天查询趋势，共 ' + total + ' 次，峰值 ' + peak + ' 次。' + days.map(day => day.d + '：' + day.n + ' 次').join('；'));
    $('city-chart').setAttribute('aria-label', '热门城市前十名。' + (cities.map(city => city.city + '：' + city.n + ' 次').join('；') || '暂无查询记录'));
    $('date-labels').replaceChildren();
    [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])].filter(i => days[i]).forEach(i => {
        const label = document.createElement('span'); label.textContent = days[i].d.slice(5); $('date-labels').appendChild(label);
    });
    $('city-labels').replaceChildren();
    cities.forEach(city => {
        const row = document.createElement('li'), name = document.createElement('span'), count = document.createElement('span');
        name.className = 'city-name'; name.textContent = city.city; name.title = city.city;
        count.className = 'city-count'; count.textContent = city.n;
        row.append(name, count); $('city-labels').appendChild(row);
    });
    drawCharts();
}
new ResizeObserver(drawCharts).observe(document.querySelector('.charts'));
async function loadOverview() {
    $('refresh').disabled = true;
    try {
        setError('');
        const [data, stats] = await Promise.all([api('/admin/api/overview', 'GET'), api('/admin/api/stats', 'GET')]);
        renderStats(stats);
        renderUsers(data.users);
        renderFavorites(data.favorites);
        renderHistory(data.history);
    } catch (error) { setError(error.message); }
    finally { $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', loadOverview);
$('logout').addEventListener('click', async () => {
    try { await api('/admin/logout', 'POST'); location.href = '/admin'; }
    catch (error) { setError(error.message); }
});
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

app.get('/admin/api/stats', adminAuth, (req, res) => {
    res.json({
        counts: { users: stmt.userCount.get().n, favorites: stmt.favCount.get().n,
            history: stmt.histTotal.get().n, cache: stmt.cacheCount.get().n },
        byCity: stmt.byCity.all(),
        byDay: stmt.byDay.all(),
        byProvince: stmt.byProvince.all()
    });
});

app.post('/admin/logout', adminAuth, (req, res) => {
    ADMIN_TOKENS.delete(getAdminToken(req));
    res.clearCookie('admin_token', { path: '/admin' });
    res.json({ success: true });
});

app.get('/admin', (req, res) => {
    if (req.query.token) return res.redirect('/admin');
    if (isAdminTokenValid(getAdminToken(req))) {
        return sendAdminPage(res);
    }
    return res.send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>后台登录</title>
<style>
/* 值镜像自 frontend/css/style.css 的 :root，改动请同步 */
:root{--bg:#0a0e17;--surface:#121724;--ink:#eef2f8;--ink-secondary:#aab4c6;--primary:#5b9cf5;--border:rgba(255,255,255,.07);--danger:#e06070;}
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0;padding:24px 16px;line-height:1.5}
.box{width:100%;max-width:360px}h1{font-size:24px;margin:0 0 24px}label{display:block;color:var(--ink-secondary);font-size:13px;margin-top:16px}
input{padding:12px 16px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--ink);font:inherit;margin:8px 0;width:100%;display:block}
button{padding:12px 28px;border-radius:4px;border:0;background:var(--primary);color:var(--bg);font:inherit;font-weight:600;cursor:pointer;margin-top:16px;width:100%}button:active{opacity:.8}
:focus-visible{outline:2px solid var(--primary);outline-offset:2px}.error{color:var(--danger);font-size:13px;margin-top:12px}
</style></head><body><main class="box"><h1>数据后台</h1>
<form id="loginForm"><label for="admin-username">用户名</label><input id="admin-username" type="text" name="username" autocomplete="username" required><label for="admin-password">密码</label><input id="admin-password" type="password" name="password" autocomplete="current-password" required><button type="submit">登录</button></form>
<p class="error" id="errMsg" role="alert"></p></main>
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
const server = app.listen(PORT, () => {
    console.log(`天气后端服务已启动: http://localhost:${PORT} (SQLite)`);
    console.log('API 文档以 docs/api.md 为准（路由清单按 server.js 实际注册同步）');
});

// ===== 优雅关闭：先排空 HTTP 请求，再把 WAL 合并进主库 =====
let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) {
        console.error(`再次收到 ${signal}，立即退出。`);
        process.exit(1);
    }
    shuttingDown = true;
    console.log(`收到 ${signal}，正在关闭…`);

    let finalized = false;
    let exitCode = 0;
    function reportError(step, error) {
        exitCode = 1;
        console.error(`关闭失败（${step}）：`, error?.stack || error);
    }
    function finalize(error) {
        if (finalized) return;
        finalized = true;
        clearTimeout(timeout);
        if (error) reportError('server.close', error);
        try {
            const result = db.pragma('wal_checkpoint(TRUNCATE)');
            // SQLite 的 busy 结果不会抛错，必须检查，避免误报 WAL 已合并。
            if (result.some(row => row.busy !== 0)) throw new Error('WAL checkpoint 被其他数据库连接阻塞');
        } catch (error) {
            reportError('WAL checkpoint', error);
        }
        try {
            db.close();
        } catch (error) {
            reportError('db.close', error);
        }
        if (exitCode === 0) console.log('已优雅关闭（WAL 已合并）');
        else console.error('关闭结束（存在错误，请检查 WAL），退出码 1。');
        process.exit(exitCode);
    }

    const timeout = setTimeout(() => {
        console.warn('关闭等待已达 5s，终止剩余连接并继续合并 WAL。');
        try {
            server.closeAllConnections();
        } catch (error) {
            reportError('server.closeAllConnections', error);
        }
        finalize();
    }, 5000);
    try {
        server.close(finalize);
    } catch (error) {
        finalize(error);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
