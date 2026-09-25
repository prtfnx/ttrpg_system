# Renderer performance reference

Audience: contributors measuring or changing the Rust/WASM renderer.

Status: current local reference. These measurements are not product SLAs.

Last source audit: 2026-09-25

## Purpose

This page records one reproducible renderer measurement and the environment
that produced it. Compare later measurements only when the scene, build,
browser, canvas, warm-up, and sample count match. Wall-clock values from a
different machine or WebGL backend are not directly comparable.

Deterministic operation counters remain the CI performance gates. Timing is a
local diagnostic because browser scheduling and graphics drivers add noise.

## Run the reference

Build the generated WASM package first. Then run from `apps/web-ui` in
PowerShell:

```powershell
$env:VITE_RENDERER_REFERENCE = '1'
pnpm.cmd exec vitest run `
  src/lib/wasm/__tests__/rendererReference.wasm-test.ts `
  --project browser --reporter=verbose
Remove-Item Env:VITE_RENDERER_REFERENCE
```

The test has no timing assertion. It prints one `RENDERER_REFERENCE` JSON
record and remains skipped in the ordinary browser regression suite.

## Reference environment

Recorded on 2026-09-25 against renderer revision `6cd718fe`:

- Windows 11 Pro 23H2, build 22631;
- AMD Ryzen 5 5600, 6 cores and 12 logical processors;
- NVIDIA GeForce RTX 3070 Ti, driver `32.0.16.1664`;
- Playwright `1.59.1`, Chromium `147.0.7727.15`;
- actual WebGL renderer: ANGLE Vulkan with SwiftShader Device (Subzero);
- 1920 x 1080 canvas;
- optimized WASM with `wasm-start,dev-logging` features.

The physical RTX GPU was present but was not the WebGL renderer for this
headless run. Treat these numbers as a SwiftShader CPU-path reference.

## Scene and method

The opt-in browser test reproduces the deterministic ordinary fixture:

- 100 sprites sharing one generated 4 x 4 RGBA texture;
- 200 sight- and light-blocking wall segments;
- 4 enabled point lights;
- 120 unmeasured animation-frame warm-up submissions;
- 300 measured animation-frame submissions;
- 30 warm-up plus 300 measured four-source sight visibility queries.

`performance.now()` is sampled immediately around `RenderEngine.render()` or
the visibility call. This measures main-thread CPU work and WebGL command
submission. It does not wait for GPU completion.

The optional font atlas URL is unavailable in the isolated Vitest server. The
shared generated sprite texture is resident before warm-up; no external asset
download is part of the samples.

## Recorded result

| Sample | Mean | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Frame CPU submission, 300 frames | 0.238 ms | 0.200 ms | 0.400 ms | 0.700 ms |
| Four-source sight query, 300 calls | 1.866 ms | 1.800 ms | 2.100 ms | 2.800 ms |

The final submitted frame reported:

| Counter | Value |
| --- | ---: |
| Sprites considered / drawn / culled | 100 / 86 / 14 |
| Draw calls / buffer uploads | 97 / 89 |
| Active lights | 4 |
| Shadow segments total / candidates / accepted | 0 / 0 / 0 |
| Shadow draw calls | 4 |
| Occlusion revision / rebuilds | 1 / 1 |
| Resident textures / estimated bytes | 3 / 24 MiB + 64 bytes |
| Texture budget / over budget | 96 MiB / 0 |

This run is below the plan's 10 ms ordinary-scene CPU-submission target, but
it does not establish physical-GPU rendering performance or end-to-end UI
latency. Use a visible production browser trace on a named device before
making a user-facing performance claim.

The final frame is an unchanged steady-state frame. Zero shadow candidates and
accepted segments means the renderer reused the previously uploaded lighting
geometry; the four shadow draw calls are still required because each light has
an independent stencil mask.

## Refresh rules

Refresh this reference after changes to frame submission, shaders, culling,
lighting, occlusion, texture binding, generated WASM, or the browser runner.
Record a new row or replace the reference only when the command and environment
are documented together. Never turn one machine's wall-clock value into a CI
threshold.
