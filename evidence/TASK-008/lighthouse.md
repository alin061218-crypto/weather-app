# TASK-008 Lighthouse

Lighthouse was explicitly attempted on 2026-10-05 with:

```text
npx --no-install lighthouse --version
```

The repository has no local Lighthouse package, and `npx --no-install` refused to download the missing `lighthouse@13.5.0` package in this offline evidence environment. The Lighthouse installable/offline score is therefore **exempted**, with the reason recorded here. Playwright evidence still confirms an activated controller and all 22 expected precache entries.
