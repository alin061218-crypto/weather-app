# TASK-018 acceptance evidence

All measurements below were run on the same Windows machine against the same local Edge and localhost service.

## Cold start comparison

`node evidence/TASK-018/compare.cjs`

| Version | Weather view visible | City | `document.body.scrollWidth` | `innerWidth` |
|---|---:|---|---:|---:|
| Before (HEAD, serial location -> weather -> fallback) | 6468 ms | Beijing | 735 | 750 |
| After (default city + concurrent requests) | 443 ms | Beijing | 735 | 750 |

Improvement: 6025 ms. The harness delays the backend weather response by 6 seconds and returns the direct Open-Meteo response after 300 ms; the updated path uses the direct winner.

## Location cache

`node evidence/TASK-018/latency.cjs --cold`

- First `/api/location`: 99.6 ms, HTTP 200
- Second `/api/location`: 2.7 ms, HTTP 200, `private, max-age=1800`

## First screen without location

`node evidence/TASK-018/boot.cjs`

- IP and GPS providers forced unreachable
- Weather view visible in 140 ms
- City: Beijing
- `document.body.scrollWidth`: 735; viewport: 750

## Static headers and compression

`node evidence/TASK-018/headers.cjs`

- `/index.html`: `Cache-Control: no-cache`
- `/data/cities.json`: `public, max-age=86400`
- `/js/main.js`: `public, max-age=31536000, immutable`
- `/css/style.css`: `public, max-age=31536000, immutable`
- `/vendor/three.module.js`: `Content-Encoding: gzip`, 265698 bytes, `public, max-age=31536000, immutable`

## Regression

- `node --check server.js`
- `node --check frontend/js/main.js`
- TASK-016c screenshots and fingerprint checks, backend and fallback modes, passed at 375 / 768 / 1280 px.
