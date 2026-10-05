# TASK-008 results

The service worker now derives its shell and module precache from the server-rendered importmap, derives `weather-app-<style hash>` from the injected stylesheet URL, reports per-asset failures, uses explicit network-only handling for `/api/`, `/admin`, and the configured external providers, and clears Cache Storage on logout. The three obsolete cache-control meta tags were removed.

Evidence runs:

```text
node evidence/TASK-008/static.cjs
PASS: static SW shell/importmap/hash/network-only/logout checks; obsolete cache-control metas removed

node evidence/TASK-008/precache.cjs
PASS: precache assets 22 / failed 0 (shell 6 + importmap modules 16)

node evidence/TASK-008/pwa.cjs
PASS: controller=true, active=activated, precache success 22/22, cache entries total 25

node evidence/TASK-008/no-api-cache.cjs
PASS: [{"url":"/api/me","status":401},{"url":"/admin/api/stats","status":401}]; cache entries 25; forbidden API/admin entries 0

node evidence/TASK-008/logout-clear.cjs
PASS: logout cleared 2 cache(s); caches.keys() after logout = []

node evidence/TASK-008/cache-name.cjs
PASS: CACHE_NAME changed weather-app-fb82530e -> weather-app-53b6359d after one-byte style mutation
```

The total cache entry count includes three runtime static/data requests; the precache assertion separately checks all 22 expected shell and importmap-derived URLs.

Lighthouse is explicitly exempted because the local package is unavailable; see `lighthouse.md`.
