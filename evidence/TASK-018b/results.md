# TASK-018b evidence

All measurements use the local Edge headless browser and the same localhost
fixture style as TASK-018. The evidence scripts create temporary profiles and
servers; they do not modify product files.

## Version injection

`node evidence/TASK-018b/version.cjs` mutates `frontend/js/main.js`, reloads
`index.html`, and then restores the file. Both the original and mutated
`?v=` values equal the first eight characters of the file's SHA-1, and the
value changes when the content changes.

Observed output:

```text
{
  "before": { "version": "64ccff00", "sha1_8": "64ccff00" },
  "after": { "version": "7a97b97e", "sha1_8": "7a97b97e" }
}
PASS: changing main.js changes the injected ?v= and both values equal SHA-1[:8]
```

## Request race and privacy

`node evidence/TASK-018b/race.cjs` uses a 6 s backend weather response and a
300 ms direct Open-Meteo response. One direct request is made and the slower
backend loser receives `AbortSignal` cancellation. The default location path
falls back to `ipapi.co` when the backend location request fails.

`node evidence/TASK-018b/race.cjs --location` makes the backend location request
succeed. In that mode `ipapi.co` request count is zero, while the weather race
still has exactly one Open-Meteo request and a canceled backend loser.

## Cold-start latency and the 415 -> 656 ms regression

### 慢后端场景

TASK-018 recorded **415 ms** for the updated TASK-018 path with the fixture
explicitly described as backend weather **6 s** and direct Open-Meteo **300 ms**.
TASK-018b's reported result under the same fixture was **656 ms**. The inputs
are the same, so this is a real slow-backend regression of about **+58%**:

```text
(656 - 415) / 415 = 58.1%
```

The cause is intentional scheduling. TASK-018 used `Promise.any`, so both
routes started together and the 300 ms direct response won. TASK-018b's
`frontend/js/main.js:198` adds a **150 ms hedge** before starting the direct
route. In the slow-backend fixture the expected path is therefore roughly
`150 + 300 = 450 ms`, plus browser and fixture overhead, producing the
observed ~656 ms result. The current rerunnable harness measured 628 ms in the
final run (normal local browser jitter; recent runs were 575-643 ms).

这是有意权衡（intentional trade-off）。When the backend returns within 150 ms, as
in the common/cache case, the direct request is never sent: there is one
request and no added latency. Only a slow backend waits the extra 150 ms. The
benefit is that normal loads no longer double-hit Open-Meteo and no longer send
the user's IP to a third party on every load.

### 常见场景

The required common scenario is measured separately below. It represents the
usual backend/cache experience, not the 6 s failure-path experience.

| Scenario | Backend fixture | Direct fixture | Cold start | Open-Meteo requests | Backend canceled |
|---|---:|---:|---:|---:|---:|
| Slow backend | 6000 ms | 300 ms | 628 ms | 1 | 1 |
| Common backend/cache | 80 ms | 300 ms (hedge not reached) | 275 ms | 0 | 0 |

Observed `node evidence/TASK-018b/latency.cjs` output:

```text
{
  "slowBackend": { "backendDelay": 6000, "directDelay": 300, "elapsedMs": 628,
    "requests": { "backendWeather": 1, "openMeteo": 1, "backendCanceled": 1 } },
  "common": { "backendDelay": 80, "directDelay": 300, "elapsedMs": 275,
    "requests": { "backendWeather": 1, "openMeteo": 0, "backendCanceled": 0 } }
}
PASS: cold-start latency measured for slow-backend and common backend/cache scenes; common direct requests=0
```

## Version guard command

`npm run check:versions` runs the scripted guard:

```text
> weather-backend@1.0.0 check:versions
> node server.js --check-asset-versions

PASS: 3 index asset versions match SHA-1 content hashes
```
