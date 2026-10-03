# TASK-021 acceptance evidence

Production edits are confined to `RainScene` in `frontend/js/atmosphere.js`.
The before source is loaded with `git show` from commit
`6d51f6d5fe03d3b06db6a2e612da33458c32f9d5`, recorded in `baseline.json`.
The browser fixture uses Shanghai, WMO 61, ordinary rain, and seed 21.

## 1. Stable depth and scope

`node evidence/TASK-021/layers.cjs`:

```text
PASS code: data={x,y,z,sp}; update has no Math.random; matrix uses d.z; only RainScene changed; global dt=0.016
```

Each drop keeps its original x/z through recycling. Its y wraps with overshoot
preserved. A 20-second test throws if update calls `Math.random` and checks
unchanged x/z, reduced motion, and disposal of all three geometries/materials.

Rain alone uses the elapsed `time` between updates, capped at 0.05 seconds.
This browser ran approximately 165 RAFs per second: using the global fixed dt
would multiply the intended rain speed. `_loop()` and cloud/dust timing retain
their existing dt behavior.

## 2. Center and text masks

`node evidence/TASK-021/rain-mask.cjs` tests 100 seeds per viewport. Text bounds
come from actual DOM text ranges plus 24 px padding, projected with the browser's
camera. Upper-half candidates receive stronger rejection. Fixed fall lanes
also keep the text band sparse after recycling.

```text
PASS 375x812, 100 seeds: |x|<1.2 14.87% -> 24.60% (max seed 24.62% <=25%); text 1.48% -> 0.02%; 12s lifecycle center=24.62%, text=0.59%; upper/lower center=286/1313
PASS 768x1024, 100 seeds: |x|<1.2 14.87% -> 23.66% (max seed 24.62% <=25%); text 1.02% -> 0.02%; 12s lifecycle center=23.54%, text=0.20%; upper/lower center=239/1299
PASS 1280x900, 100 seeds: |x|<1.2 14.87% -> 8.94% (max seed 16.92% <=25%); text 2.00% -> 0.00%; 12s lifecycle center=8.15%, text=0.08%; upper/lower center=65/516
```

The original center fraction is measured as 14.87%, not the specification's
estimated 60%. That 60% describes the full-domain sampling branch, not the
fraction landing inside |x|<1.2. On narrow screens, rejecting most horizontally
offscreen candidates raises the world-space center fraction, while the actual
projected text band is much emptier. All seeds and the recycling test meet the
<=25% bound. Complete measurements are in `rain-mask.json`.

## 3. Layers and grades

`layers.cjs` passes four grades in both themes. It checks three actual
InstancedMeshes, three distinct materials, the instance matrix scales, z bounds,
speed ranges, counts, lengths, reduced motion, and disposal.

| Grade | N | Near/middle/far counts | Speed (units/s) | Length |
| --- | ---: | --- | --- | ---: |
| drizzle | 45 | 11/20/14 | 0.9-1.4 | 0.05 |
| rain | 65 | 16/29/20 | 1.6-2.4 | 0.13 |
| heavy | 95 | 24/43/28 | 2.4-3.4 | 0.18 |
| storm | 90 | 23/41/26 | 3.0-4.2 | 0.22 |

For every row/theme: opacity factors = 1.00/0.75/0.45, size factors =
1.35/1.00/0.70, z ranges = [0.7,2.0]/[-0.7,0.7]/[-2.0,-0.7].
Actual light material opacities are 0.13/0.0975/0.0585; dark opacities are
0.22/0.165/0.099. Full results are in `layers.json`.

## 4. Continuous frames and visual review

Run `node evidence/TASK-021/clip.cjs` to regenerate all five clips. It captures
the native WebGL buffer immediately after real renderer calls, sampling at
60 Hz for at least two seconds. No synthetic update loop creates these clips.
Each full-viewport PNG combines the captured native WebGL frame, a static
transparent DOM foreground screenshot, and the computed body background.
Canvas CSS opacity is applied during this composition.

| Clip | Samples/GIF pages | Duration (ms) | Actual RAF renders |
| --- | ---: | ---: | ---: |
| [Before, dark desktop](rain-before.gif) | 121 | 2005.8 | 329 |
| [After, dark desktop](rain-after.gif) | 121 | 2005.6 | 332 |
| [After, light desktop](rain-after-light-1280.gif) | 121 | 2005.8 | 332 |
| [After, dark phone](rain-after-dark-375.gif) | 121 | 2005.7 | 332 |
| [After, light phone](rain-after-light-375.gif) | 121 | 2005.5 | 332 |

Desktop viewport is 1280x900, phone is 375x812. Assertions verify actual
`innerWidth`/`innerHeight`, body horizontal overflow, nonblank WebGL pixels in
every frame, and visible samples from all three layers in each after clip.
GIFs preserve every sample and last 2030 ms including their final-frame delay.
Desktop GIFs are resized to 960x675; original PNGs retain the full viewport.

Original numbered PNGs are in the corresponding `*-frames/` directories.
`*-trajectory.json` records timestamps and every instance's world/screen position.
`*-sequence.png` shows samples 0/1/2/3/40/81/119/120.

Visual review of these sequences: the before drops change horizontal projection
and apparent size between adjacent frames; after drops keep their shape and fall
continuously. Near drops are larger/clearer, distant drops are finer/fainter,
and the actual hero text band is sparse. Light desktop/phone streaks remain pale
and do not form a dark scratch pattern. The existing broad gray scrim is visible
in light theme and is outside this task's RainScene scope.

Before source SHA-256:
`dea03dbc343abcfcded07408d205c651e9ad96ecc64a217c8c11bedb23e09a49`.
All after clips use SHA-256:
`fa8fc4c0b888a8c70829cbc4c1d06110470c6ce89cc42f40439791fe74469a61`.

## 5. Screen speed

`node evidence/TASK-021/speed.cjs` measures recorded instance positions projected
by the active browser camera, dividing displacement by `performance.now()` time.
It excludes wrapped/offscreen segments and checks the current source hash.

```text
PASS depth jitter: mean delta-z/frame 1.331 -> 0.000; after max=0
PASS visible rain median=368.0 px/s, n=33, target=250-450 px/s
PASS measured drop #20: frame 0->120, y=168.7->816.6 px; 648.0 px / 2.006 s = 323.1 px/s
```

Perspective produces different pixel speeds by depth: near median 530.4,
middle 388.5, far 301.3 px/s. The target is met by the typical visible rain and
the measured middle-layer segment; it is not claimed that every near drop is
within that range. Full per-drop trajectories and layer statistics are in
`speed.json`.

## 6. Regression

`node evidence/TASK-021/regression.cjs` runs the requested commands and saves
their complete outputs in this directory:

```text
node evidence/TASK-019/light-night.cjs: 6 PASS, no runtime errors
npm run check:versions: PASS: 15 index asset versions match SHA-1 content hashes
npm run check:evidence: 9 PASS + TASK-018-headers explicit SKIP; exit 0
git diff --check: exit 0; final check after restoring generated files has no output
```

The default repository guard explicitly skips TASK-018 when no application
server is running. An additional run against the real server with a disposable
SQLite DB failed the existing TASK-018 expectation for the unversioned
`/vendor/three.module.js`: it expects immutable/one-year caching, whereas
`server.js` returns `no-cache` for URLs without a valid version query.
Both `server.js` and `evidence/TASK-018/headers.cjs` are unchanged from the
before commit. This unrelated failure is preserved in
`check-evidence-real-server.txt` and `headers-real-server.txt`;
`regression.cjs --real-server` reproduces it.
The temporary server and DB were cleaned up.

The guard regenerates other tasks' screenshots/logs. Those generated changes
are restored after validation so the committed write scope remains RainScene
and `evidence/TASK-021/`.

## Reproduction

From the repository root, using Node and the existing Edge/Playwright fixtures:

```powershell
node evidence/TASK-021/rain-mask.cjs
node evidence/TASK-021/layers.cjs
node evidence/TASK-021/clip.cjs
node evidence/TASK-021/speed.cjs
node evidence/TASK-021/regression.cjs
```

`EVIDENCE_MODULES` may override the bundled dependency directory used for Sharp.
