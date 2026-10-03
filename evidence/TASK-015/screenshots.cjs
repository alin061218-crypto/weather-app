const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const outDir = path.resolve(__dirname);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), `Edge not found: ${edge}`);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const hours = Array.from({ length: 24 }, (_, i) => 18 + Math.round(5 * Math.sin(i / 24 * Math.PI * 2)));
const days = Array.from({ length: 7 }, (_, i) => ({
  time: `2026-10-${String(2 + i).padStart(2, '0')}`,
  temperature_2m_max: 25 + i % 3,
  temperature_2m_min: 17 + i % 2,
  weathercode: 0,
  precipitation_probability_max: 10 + i
}));
const weather = { current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
  hourly: { time: Array.from({ length: 24 }, (_, i) => `2026-10-02T${String(i).padStart(2, '0')}:00`), temperature_2m: hours,
    apparent_temperature: hours.map(v => v), relativehumidity_2m: hours.map(() => 60), cloudcover: hours.map(() => 25),
    uv_index: hours.map(() => 2), precipitation_probability: hours.map(() => 10), pressure_msl: hours.map(() => 1013), visibility: hours.map(() => 10000) },
  daily: { time: days.map(d => d.time), temperature_2m_max: days.map(d => d.temperature_2m_max), temperature_2m_min: days.map(d => d.temperature_2m_min),
    weathercode: days.map(d => d.weathercode), precipitation_probability_max: days.map(d => d.precipitation_probability_max) } };
const bootstrap = `<script>
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_, reject) { reject(new Error('GPS disabled')); } } });
const realFetch = window.fetch.bind(window);
window.fetch = (input, options) => { const u = new URL(String(input), location.href);
  if (u.pathname === '/api/location') return Promise.resolve(new Response(JSON.stringify({ city:'北京', region:'北京', country:'中国', lat:39.904, lon:116.407 }), { headers:{'Content-Type':'application/json'} }));
  if (u.pathname === '/api/weather') return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(weather))}, { headers:{'Content-Type':'application/json'} }));
  return realFetch(input, options);
</script>`;
const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(requestUrl.pathname);
  const mode = requestUrl.searchParams.get('evidence');
  const file = path.resolve(frontend, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(frontend + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    if (pathname === '/') {
      const evidenceStyle = mode === 'compact'
        ? '<style>html,body,.app{width:375px!important;max-width:375px!important}.tab-bar{left:187.5px!important;width:343px!important}</style>'
        : mode === 'medium'
          ? '<style>html,body,.app{width:768px!important;max-width:768px!important}</style>'
            : mode === 'expanded'
            ? '<style>html,body{width:1280px!important;max-width:1280px!important}</style>'
            : mode === 'verify'
              ? '<style>html,body{width:1280px!important;max-width:1280px!important}</style><script>setTimeout(()=>document.title="METRICS:"+JSON.stringify({stats:document.querySelector(".stats-scroll")?.getBoundingClientRect().toJSON(), metricCount:document.querySelectorAll(".stat-chip").length, body:document.body.getBoundingClientRect().toJSON()}),3000)</script>' : '';
      content = Buffer.from(String(content).replace(/<script\b[^>]*type=["']module["'][^>]*><\/script>/, evidenceStyle + bootstrap + '$&'));
    }
    res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(content);
  });
});
function runEdge(args, capture = false) { return new Promise((resolve, reject) => { const p = spawn(edge, args, { windowsHide: true, stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] }); let err = '', out = ''; if (capture) p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; }); p.on('error', reject); p.on('close', code => code ? reject(new Error(`Edge ${code}: ${err}`)) : resolve(out)); }); }
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  for (const [name, width, height] of [['compact', 375, 900], ['medium', 768, 1000], ['expanded', 1280, 1000]]) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), `task015-${name}-`));
    try { await runEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--virtual-time-budget=7000', `--screenshot=${path.join(outDir, `${name}.png`)}`, `${url}?evidence=${name}`]); }
    finally { fs.rmSync(profile, { recursive: true, force: true }); }
  }
  const verifyProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'task015-verify-'));
  try {
    const dom = await runEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', `--user-data-dir=${verifyProfile}`, '--window-size=1280,1000', '--virtual-time-budget=7000', '--dump-dom', `${url}?evidence=verify`], true);
    const match = dom.match(/<title>(METRICS:([\s\S]*?))<\/title>/);
    assert.ok(match, 'layout metrics missing');
    const metrics = JSON.parse(match[2]);
    assert.equal(metrics.metricCount, 8, 'expected eight visible metric cells');
    assert.match(dom, />气压<\//, 'pressure metric missing');
    assert.ok(metrics.stats.width > 0 && metrics.stats.right <= 1280, 'metrics grid extends outside 1280px evidence viewport');
    console.log('PASS: 1280px DOM has 8 metric cells including 气压 with no horizontal overflow');
  } finally { fs.rmSync(verifyProfile, { recursive: true, force: true }); }
  server.close();
  console.log('PASS: compact.png medium.png expanded.png');
}
main().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
