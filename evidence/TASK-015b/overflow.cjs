const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), `Edge not found: ${edge}`);

const hours = Array.from({ length: 24 }, (_, i) => 18 + Math.round(5 * Math.sin(i / 24 * Math.PI * 2)));
const days = Array.from({ length: 7 }, (_, i) => ({
  time: `2026-10-${String(2 + i).padStart(2, '0')}`,
  temperature_2m_max: 25 + i % 3,
  temperature_2m_min: 17 + i % 2,
  weathercode: 0,
  precipitation_probability_max: 10 + i
}));
const weather = {
  current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
  hourly: {
    time: Array.from({ length: 24 }, (_, i) => `2026-10-02T${String(i).padStart(2, '0')}:00`),
    temperature_2m: hours,
    apparent_temperature: hours,
    relativehumidity_2m: hours.map(() => 60),
    cloudcover: hours.map(() => 25),
    uv_index: hours.map(() => 2),
    precipitation_probability: hours.map(() => 10),
    pressure_msl: hours.map(() => 1013),
    visibility: hours.map(() => 10000)
  },
  daily: {
    time: days.map(d => d.time),
    temperature_2m_max: days.map(d => d.temperature_2m_max),
    temperature_2m_min: days.map(d => d.temperature_2m_min),
    weathercode: days.map(d => d.weathercode),
    precipitation_probability_max: days.map(d => d.precipitation_probability_max)
  }
};

const bootstrap = `<script>
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_, reject) { reject(new Error('GPS disabled')); } } });
const realFetch = window.fetch.bind(window);
window.fetch = (input, options) => { const u = new URL(String(input), location.href);
  if (u.pathname === '/api/location') return Promise.resolve(new Response(JSON.stringify({ city:'北京', region:'北京', country:'中国', lat:39.904, lon:116.407 }), { headers:{'Content-Type':'application/json'} }));
  if (u.pathname === '/api/weather') return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(weather))}, { headers:{'Content-Type':'application/json'} }));
  return realFetch(input, options);
};
</script>`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(frontend, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(frontend + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    if (pathname === '/') {
      const mode = new URL(req.url, 'http://localhost').searchParams.get('evidence');
      const evidenceStyle = mode === 'compact-375'
        ? '<style>html,body,.app{width:375px!important;max-width:375px!important}.tab-bar{left:187.5px!important;width:343px!important}</style>'
        : mode === 'medium-768'
          ? '<style>html,body{width:100%!important;max-width:100%!important}.app{width:100%!important;max-width:720px!important}</style>'
          : '<style>html,body{width:100%!important;max-width:100%!important}</style>';
      content = Buffer.from(String(content).replace(
      /<script\b[^>]*type=["']module["'][^>]*><\/script>/,
      evidenceStyle + bootstrap + `<script>
        setTimeout(() => {
          const chips = [...document.querySelectorAll('.stat-chip')];
          document.title = 'METRICS:' + JSON.stringify({
            viewport: { innerWidth, outerWidth, devicePixelRatio, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, rectWidth: document.documentElement.getBoundingClientRect().width },
            stats: { scrollWidth: document.querySelector('.stats-scroll')?.scrollWidth, clientWidth: document.querySelector('.stats-scroll')?.clientWidth },
            chips: chips.map(chip => ({ scrollWidth: chip.scrollWidth, clientWidth: chip.clientWidth })),
            widest: [...document.querySelectorAll('body *')].map(element => ({ selector: element.className || element.id || element.tagName, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right })).filter(item => item.right > document.documentElement.clientWidth + 1).slice(0, 8),
            metricCount: chips.length
          });
        }, 3000);
      </script>$&`
    ));
    }
    res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(content);
  });
});

function runEdge(args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(edge, args, { windowsHide: true, stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let out = '', err = '';
    if (capture) child.stdout.on('data', data => { out += data; });
    child.stderr.on('data', data => { err += data; });
    child.on('error', reject);
    child.on('close', code => code ? reject(new Error(`Edge ${code}: ${err}`)) : resolve(out));
  });
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const results = [];
  for (const [name, width] of [['compact-375', 375], ['medium-768', 768], ['expanded-1280', 1280]]) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), `task015b-${name}-`));
    try {
      const dom = await runEdge([
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=1', `--user-data-dir=${profile}`, `--window-size=${width},1000`,
        '--virtual-time-budget=7000', `--screenshot=${path.join(__dirname, `${name}.png`)}`, '--dump-dom', `${url}?evidence=${name}`
      ], true);
      const match = dom.match(/<title>(METRICS:([\s\S]*?))<\/title>/);
      assert.ok(match, `${name}: layout metrics missing`);
      const metrics = JSON.parse(match[2]);
      console.log(`${name} metrics: ${JSON.stringify(metrics)}`);
      assert.equal(metrics.metricCount, 8, `${name}: expected eight metric cells`);
      assert.ok(metrics.viewport.scrollWidth <= metrics.viewport.clientWidth + 1,
        `${name}: document overflow ${metrics.viewport.scrollWidth} > ${metrics.viewport.clientWidth}`);
      assert.ok(metrics.stats.scrollWidth <= metrics.stats.clientWidth + 1,
        `${name}: stats overflow ${metrics.stats.scrollWidth} > ${metrics.stats.clientWidth}`);
      for (const [index, chip] of metrics.chips.entries()) {
        assert.ok(chip.scrollWidth <= chip.clientWidth + 1,
          `${name}: chip ${index + 1} overflow ${chip.scrollWidth} > ${chip.clientWidth}`);
      }
      results.push({ name, ...metrics });
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  server.close();
  for (const result of results) console.log(JSON.stringify(result));
  console.log('PASS: document, stats band, and all stat chips fit at 375 / 768 / 1280px');
}

main().catch(error => { server.close(); console.error(error.stack || error); process.exitCode = 1; });
