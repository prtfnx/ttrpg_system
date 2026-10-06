// Real built-UI acceptance and load verification. Launched by the isolated Python runner.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from 'playwright';

const fixture = JSON.parse(await readFile(process.argv[2], 'utf8'));
const report = { fixture: 'synthetic', cutover: fixture.cutover, stages: [], thresholds: {
  previewP95Ms: 50, eventP95Ms: 250, commandP95Ms: 250, snapshotMaxMs: 5000,
  frameMeanMs: 10, frameP95Ms: 16.7, retainedBufferGrowth: 0, heapGrowthBytes: 64 * 1024 * 1024,
} };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const clients = [];
const failures = [];

// React's supported DevTools hook observes real provider instances without shipping a test API.
function installProbe() {
  const probe = window.__paintRelease = { frames: [], previews: [], commands: [], snapshots: [], messages: [],
    liveBuffers: new Set(), sockets: [], lastInput: 0, pendingPreview: null, inputTracking: false,
    sent: new Map(), snapshotParts: new Map(), dropNextEvent: false, dropPreviews: false,
    reverseSnapshots: false, holdSnapshots: false, heldChunks: [], replaying: false,
    revisionGaps: 0, requestCount: 0, peakQueuedBytes: 0 };
  for (const method of ['instantiate', 'instantiateStreaming']) {
    const original = WebAssembly[method].bind(WebAssembly);
    WebAssembly[method] = async (...args) => {
      const result = await original(...args);
      const instance = result.instance ?? result;
      probe.wasmMemory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
      return result;
    };
  }
  const glPrototype = WebGL2RenderingContext.prototype;
  const create = glPrototype.createBuffer;
  const remove = glPrototype.deleteBuffer;
  glPrototype.createBuffer = function (...args) {
    const buffer = create.apply(this, args);
    if (buffer) probe.liveBuffers.add(buffer);
    return buffer;
  };
  glPrototype.deleteBuffer = function (buffer) {
    probe.liveBuffers.delete(buffer);
    return remove.call(this, buffer);
  };
  const instrumentRuntime = runtime => {
    if (probe.runtime === runtime) return;
    probe.runtime = runtime;
    const draft = runtime.setPaintDraft.bind(runtime);
    runtime.setPaintDraft = (...args) => {
      const accepted = draft(...args);
      if (accepted && args[1] === 'local' && probe.inputTracking && probe.lastInput) {
        probe.pendingPreview = probe.lastInput;
      }
      return accepted;
    };
    const instrumentEngine = () => {
      const engine = runtime.getRenderEngine();
      if (!engine || probe.engine === engine) return;
      probe.engine = engine;
      const render = engine.render.bind(engine);
      engine.render = (...args) => {
        const start = performance.now();
        const result = render(...args);
        probe.frames.push(performance.now() - start);
        if (probe.frames.length > 2000) probe.frames.shift();
        if (probe.pendingPreview !== null) {
          probe.previews.push(performance.now() - probe.pendingPreview);
          probe.pendingPreview = null;
        }
        return result;
      };
    };
    runtime.store.subscribe(instrumentEngine);
    instrumentEngine();
  };
  const visit = fiber => {
    if (!fiber) return;
    const value = fiber.memoizedProps?.value;
    if (value?.controller?.getState && value?.interaction) {
      probe.paint = value.controller;
      probe.interaction = value.interaction;
    }
    if (value?.getRenderEngine && value?.replacePaintObjectSnapshot) instrumentRuntime(value);
    visit(fiber.child);
    visit(fiber.sibling);
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, inject: () => 1,
    onCommitFiberRoot: (_id, root) => visit(root.current), onCommitFiberUnmount: () => {}, checkDCE: () => {} };
  for (const type of ['pointerdown', 'pointermove']) document.addEventListener(type, event => {
    if (probe.inputTracking && event.target instanceof HTMLCanvasElement) probe.lastInput = performance.now();
  }, { capture: true, passive: true });
  const Native = window.WebSocket;
  window.WebSocket = new Proxy(Native, { construct(Target, args) {
    const ws = new Target(...args);
    probe.sockets.push(ws);
    const send = ws.send.bind(ws);
    ws.send = raw => {
      const message = JSON.parse(raw);
      if (probe.dropPreviews && ['paint_preview', 'paint_preview_cancel'].includes(message.type)) return;
      const id = message.data?.operation_id ?? message.message_id;
      probe.sent.set(id, performance.now());
      if (message.type === 'paint_snapshot_request') probe.requestCount += 1;
      const result = send(raw);
      probe.peakQueuedBytes = Math.max(probe.peakQueuedBytes, ws.bufferedAmount);
      return result;
    };
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const data = message.data ?? {};
      if (!probe.replaying && probe.dropNextEvent && message.type === 'paint_object_event') {
        probe.dropNextEvent = false;
        event.stopImmediatePropagation();
        return;
      }
      if (!probe.replaying && probe.holdSnapshots && message.type === 'paint_snapshot_chunk') {
        probe.heldChunks.push(event.data);
        event.stopImmediatePropagation();
        return;
      }
      if (!probe.replaying && probe.reverseSnapshots && message.type === 'paint_snapshot_chunk') {
        probe.heldChunks.push(event.data);
        event.stopImmediatePropagation();
        if (probe.heldChunks.length === data.chunk_count) {
          probe.replaying = true;
          for (const raw of probe.heldChunks.reverse()) ws.dispatchEvent(new MessageEvent('message', { data: raw }));
          probe.heldChunks = [];
          probe.replaying = false;
        }
        return;
      }
      const now = performance.now();
      const id = data.operation_id ?? message.correlation_id;
      const sent = probe.sent.get(id);
      if (data.operation_id && sent !== undefined) {
        probe.commands.push(now - sent);
        probe.sent.delete(id);
      }
      if (message.type === 'paint_snapshot_chunk') {
        let parts = probe.snapshotParts.get(message.correlation_id);
        if (!parts) {
          parts = { indices: new Set(), bytes: 0, start: sent ?? now };
          probe.snapshotParts.set(message.correlation_id, parts);
        }
        if (!parts.indices.has(data.chunk_index)) parts.bytes += new TextEncoder().encode(event.data).byteLength;
        parts.indices.add(data.chunk_index);
        if (parts.indices.size === data.chunk_count) {
          probe.snapshots.push({ bytes: parts.bytes, ms: now - parts.start, chunks: data.chunk_count });
          probe.snapshotParts.delete(message.correlation_id);
          probe.sent.delete(message.correlation_id);
        }
      }
      if (message.type === 'paint_object_event') {
        const state = probe.paint?.getState();
        if (state && !state.hydrating && state.tableId === data.table_id && data.revision > state.revision + 1) {
          probe.revisionGaps += 1;
        }
        probe.lastEvent = event.data;
      }
      probe.messages.push({ type: message.type, code: data.code, operationId: data.operation_id,
        revision: data.revision, action: data.action, receivedAt: Date.now() });
      if (probe.messages.length > 4096) probe.messages.shift();
    });
    return ws;
  } });
}

async function client(index, full = true, dpr = 1) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, hasTouch: true });
  await context.addCookies([{ name: 'token', value: fixture.actors[index].token, url: fixture.baseUrl }]);
  await context.addInitScript(installProbe);
  const page = await context.newPage();
  page.on('pageerror', error => { failures.push(error.stack); console.log(`Browser ${index} error: ${error.stack}`); });
  const result = { context, page, index, full };
  clients.push(result);
  if (full) await openPaint(result);
  else {
    await page.goto(`${fixture.baseUrl}/health/ready`);
    await page.evaluate(async ({ baseUrl, sessionCode }) => {
      const ws = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/ws/game/${sessionCode}`);
      window.__paintRelease.socket = ws;
      await new Promise((resolve, reject) => {
        ws.addEventListener('message', event => { if (JSON.parse(event.data).type === 'welcome') resolve(); }, { once: true });
        ws.onerror = reject;
      });
    }, fixture);
  }
  return result;
}

async function openPaint({ page }) {
  await page.goto(`${fixture.baseUrl}/game/session/${fixture.sessionCode}`);
  await page.waitForFunction(() => window.__paintRelease.paint && window.__paintRelease.runtime?.getRenderEngine());
  await page.locator('[title="Paint System"]').click();
  await page.getByRole('button', { name: 'Draw', exact: true }).waitFor();
  await ready(page);
  await page.evaluate(() => window.__paintRelease.runtime.getRenderEngine().set_camera(0, 0, 1));
}

async function reconnectProbeClients(values) {
  for (const value of values) {
    await value.page.reload();
    await value.page.evaluate(async ({ baseUrl, sessionCode }) => {
      const ws = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/ws/game/${sessionCode}`);
      window.__paintRelease.socket = ws;
      await new Promise((resolve, reject) => {
        ws.addEventListener('message', event => { if (JSON.parse(event.data).type === 'welcome') resolve(); }, { once: true });
        ws.onerror = reject;
      });
    }, fixture);
  }
}

async function ready(page) {
  await page.waitForFunction(() => window.__paintRelease.paint?.getState().hydrating === false,
    undefined, { timeout: 15000 });
}
async function state(page) { return page.evaluate(() => window.__paintRelease.paint.getState()); }
async function converge(left, right, expectedCount) {
  await Promise.all([left, right].map(page => page.waitForFunction(count => {
    const value = window.__paintRelease.paint.getState();
    return !value.hydrating && value.pending.length === 0 && value.committed.length === count;
  }, expectedCount)));
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const [a, b] = await Promise.all([state(left), state(right)]);
    if (!a.hydrating && !b.hydrating && a.pending.length === 0 && b.pending.length === 0
      && a.committed.length === expectedCount && b.committed.length === expectedCount
      && a.revision === b.revision && isDeepStrictEqual(a.committed, b.committed)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Clients did not converge to equal authoritative revisions/objects');
}
async function coordinates(page, x, y) {
  return page.evaluate(([wx, wy]) => {
    const canvas = [...document.querySelectorAll('canvas')].find(value => value.tabIndex === 0);
    const rect = canvas.getBoundingClientRect();
    const [sx, sy] = window.__paintRelease.runtime.getRenderEngine().world_to_screen(wx, wy);
    return { x: rect.left + sx * rect.width / canvas.width, y: rect.top + sy * rect.height / canvas.height };
  }, [x, y]);
}
async function drag(page, start, end, steps = 4) {
  const a = await coordinates(page, ...start);
  const b = await coordinates(page, ...end);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}
function editable(object) {
  return Object.fromEntries(['id', 'kind', 'geometry', 'transform', 'style'].map(key => [key, structuredClone(object[key])]));
}
function bounds(object) {
  const g = object.geometry;
  const points = g.kind === 'freehand' ? g.points : g.kind === 'line' ? [g.start, g.end]
    : [{ x: 0, y: 0 }, { x: g.width ?? g.size ?? g.diameter, y: g.height ?? g.size ?? g.diameter }];
  const xs = points.map(point => object.transform.x + point.x * object.transform.scale_x);
  const ys = points.map(point => object.transform.y + point.y * object.transform.scale_y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}
async function send(page, type, data) {
  await page.evaluate(({ type, data }) => {
    const socket = window.__paintRelease.sockets.find(ws => ws.readyState === WebSocket.OPEN);
    socket.send(JSON.stringify({ type, data, message_id: crypto.randomUUID() }));
  }, { type, data });
}
async function rejection(page, operationId, code) {
  await page.waitForFunction(({ operationId, code }) => window.__paintRelease.messages.some(
    message => message.operationId === operationId && message.code === code), { operationId, code });
}
function summarize(values) {
  assert(values.length, 'Metric has no samples');
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) };
}
async function serverMetrics() {
  const response = await fetch(`${fixture.baseUrl}/metrics`, { headers: { Authorization: `Bearer ${fixture.metricsToken}` } });
  assert.equal(response.status, 200);
  const raw = await response.text();
  const values = {};
  for (const line of raw.split('\n')) {
    if (line.startsWith('ttrpg_websocket_message_duration_seconds_') && line.includes('message_type="paint_object_update"')) {
      const split = line.lastIndexOf(' ');
      values[line.slice(0, split)] = Number(line.slice(split + 1));
    }
  }
  return { raw, values };
}
function serverLatency(before, after) {
  const entries = Object.entries(after.values).map(([key, value]) => [key, value - (before.values[key] ?? 0)]);
  const count = entries.find(([key]) => key.startsWith('ttrpg_websocket_message_duration_seconds_count'))?.[1];
  const sum = entries.find(([key]) => key.startsWith('ttrpg_websocket_message_duration_seconds_sum'))?.[1];
  assert(count > 0);
  const buckets = entries.filter(([key]) => key.includes('_bucket{'))
    .map(([key, value]) => ({ upperMs: Number(key.match(/le="([^"]+)"/)[1]) * 1000, count: value }))
    .sort((a, b) => a.upperMs - b.upperMs);
  return { count, meanMs: sum * 1000 / count, p95UpperBoundMs: buckets.find(bucket => bucket.count >= count * .95).upperMs, buckets };
}

try {
  console.log('Browser acceptance: opening player and DM');
  const dm = await client(0);
  const player = await client(1, true, 2);
  const kinds = ['Draw', 'Line', 'Rectangle', 'Square', 'Ellipse', 'Circle'];
  await player.page.getByLabel('Fill', { exact: true }).check();
  for (const [index, label] of kinds.entries()) {
    await player.page.getByRole('button', { name: label, exact: true }).click();
    await drag(player.page, [100 + index * 130, 120], [160 + index * 130, 160]);
    await converge(player.page, dm.page, index + 1);
  }
  assert.deepEqual((await state(player.page)).committed.map(object => object.kind),
    ['freehand', 'line', 'rectangle', 'square', 'ellipse', 'circle']);
  await Promise.all([player, dm].map(openPaint));
  await converge(player.page, dm.page, 6);
  console.log('Browser acceptance: move, resize, restyle every kind');
  for (const original of (await state(player.page)).committed) {
    await player.page.getByRole('button', { name: 'Select/Edit', exact: true }).click();
    let box = bounds(original);
    await drag(player.page, [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2],
      [(box.x1 + box.x2) / 2 + 12, (box.y1 + box.y2) / 2 + 12]);
    await player.page.waitForFunction(id => window.__paintRelease.paint.getState().committed.find(o => o.id === id)?.version === 2,
      original.id);
    let changed = (await state(player.page)).committed.find(o => o.id === original.id);
    box = bounds(changed);
    await drag(player.page, [box.x2, box.y2], [box.x2 + 10, box.y2 + 8]);
    await player.page.waitForFunction(id => window.__paintRelease.paint.getState().committed.find(o => o.id === id)?.version === 3,
      original.id);
    await player.page.getByLabel('Stroke color', { exact: true }).fill('#00ff00');
    await player.page.getByRole('button', { name: 'Apply style', exact: true }).click();
    await player.page.waitForFunction(id => window.__paintRelease.paint.getState().committed.find(o => o.id === id)?.version === 4,
      original.id);
    changed = (await state(player.page)).committed.find(o => o.id === original.id);
    assert.equal(changed.created_by, fixture.actors[1].id);
    assert.equal(changed.z_order, original.z_order);
    if (['circle', 'square'].includes(changed.kind)) assert.equal(changed.transform.scale_x, changed.transform.scale_y);
    await converge(player.page, dm.page, 6);
  }
  report.stages.push('all six kinds: draw/live delivery/reload/move/resize/restyle');
  const others = await Promise.all(Array.from({ length: 8 }, (_, index) => client(index + 2, false)));
  const spectator = others[0];
  const first = (await state(player.page)).committed[0];
  const foreign = editable(first);
  foreign.style.width = 8;
  const denied = crypto.randomUUID();
  await send(others[3].page, 'paint_object_update', { operation_id: denied, table_id: fixture.tableId,
    id: first.id, expected_version: first.version, object: foreign });
  await rejection(others[3].page, denied, 'forbidden');
  const deniedSpectator = crypto.randomUUID();
  await send(spectator.page, 'paint_object_create', { operation_id: deniedSpectator, table_id: fixture.tableId,
    object: { ...foreign, id: crypto.randomUUID() } });
  await rejection(spectator.page, deniedSpectator, 'forbidden');
  await dm.page.evaluate(({ id, version, object }) => window.__paintRelease.paint.submitUpdate(id, version, object),
    { id: first.id, version: first.version, object: foreign });
  await converge(dm.page, player.page, 6);
  assert.equal((await state(player.page)).committed[0].version, 5);
  report.stages.push('DM foreign-object edit; forged foreign-player/spectator commands rejected');
  const current = (await state(player.page)).committed[0];
  const updateA = editable(current); updateA.style.width = 9;
  const updateB = editable(current); updateB.style.width = 10;
  await Promise.all([[player.page, updateA], [dm.page, updateB]].map(([page, object]) => page.evaluate(
    ({ id, version, object }) => window.__paintRelease.paint.submitUpdate(id, version, object),
    { id: current.id, version: current.version, object })));
  await converge(player.page, dm.page, 6);
  assert.equal((await state(player.page)).committed[0].version, 6);
  assert.equal(await Promise.all([player.page, dm.page].map(page => page.evaluate(() =>
    window.__paintRelease.messages.filter(message => message.code === 'version_conflict').length)))
    .then(values => values.reduce((sum, value) => sum + value, 0)), 1);
  report.stages.push('concurrent versioned edits: one conflict and canonical convergence');
  await player.page.evaluate(() => { window.__paintRelease.sockets.forEach(ws => ws.close()); });
  await player.context.setOffline(true);
  const offlineObject = { ...editable(current), id: crypto.randomUUID(), kind: 'circle',
    geometry: { kind: 'circle', diameter: 25 }, transform: { x: 100, y: 250, scale_x: 1, scale_y: 1 } };
  await player.page.evaluate(object => window.__paintRelease.paint.submitCreate(object), offlineObject);
  assert.equal((await state(player.page)).pending.length, 1);
  await player.context.setOffline(false);
  await converge(player.page, dm.page, 7);
  report.stages.push('offline durable intent retained/retried once after reconnect');
  await player.page.evaluate(() => { window.__paintRelease.dropNextEvent = true; });
  for (let width = 11; width <= 12; width += 1) {
    const object = (await state(dm.page)).committed[0];
    const replacement = editable(object); replacement.style.width = width;
    await dm.page.evaluate(({ object, replacement }) => window.__paintRelease.paint.submitUpdate(object.id, object.version, replacement),
      { object, replacement });
    await dm.page.waitForFunction(version => window.__paintRelease.paint.getState().committed[0].version > version, object.version);
  }
  await converge(player.page, dm.page, 7);
  report.stages.push('deliberately dropped event: revision-gap snapshot recovery');
  const beforeRestart = (await state(player.page)).committed;
  const restartReady = once(process.stdin, 'data');
  console.log('PAINT_RELEASE_RESTART');
  await restartReady;
  process.stdin.destroy(); // No more restarts; do not keep Node alive after browser teardown.
  await converge(player.page, dm.page, 7);
  assert.deepEqual((await state(player.page)).committed, beforeRestart);
  await Promise.all([player, dm].map(openPaint));
  await converge(player.page, dm.page, 7);
  report.stages.push('real server process restart, socket reconnect and browser reload preserve canonical state');
  let remaining = (await state(player.page)).committed.length;
  for (const object of (await state(player.page)).committed) {
    await player.page.evaluate(object => window.__paintRelease.paint.submitDelete(object.id, object.version), object);
    remaining -= 1;
    await converge(player.page, dm.page, remaining);
  }
  assert.equal((await state(player.page)).committed.length, 0);
  report.stages.push('per-object deletion of every kind reaches both clients');
  console.log('Browser acceptance: touch/pen, preview loss, context recovery and table-switch races');
  await player.page.getByRole('button', { name: 'Draw', exact: true }).click();
  const point = await coordinates(player.page, 150, 250);
  await player.page.touchscreen.tap(point.x, point.y);
  await converge(player.page, dm.page, 1);
  const dot = (await state(player.page)).committed[0];
  assert(dot.geometry.points.every(value => Math.hypot(value.x - dot.geometry.points[0].x,
    value.y - dot.geometry.points[0].y) < .01), 'A touch tap must create a dot, not a dragged path');
  const pen = await player.context.newCDPSession(player.page);
  const penStart = await coordinates(player.page, 200, 250);
  const penEnd = await coordinates(player.page, 260, 280);
  await player.page.evaluate(() => { window.__paintRelease.dropPreviews = true; });
  await pen.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...penStart, button: 'left', buttons: 1,
    pointerType: 'pen', force: .25, clickCount: 1 });
  await pen.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...penEnd, button: 'left', buttons: 1,
    pointerType: 'pen', force: .8 });
  await pen.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...penEnd, button: 'left', buttons: 0,
    pointerType: 'pen', force: .8, clickCount: 1 });
  await converge(player.page, dm.page, 2);
  assert((await state(player.page)).committed[1].geometry.points.some(value => Math.abs(value.pressure - .25) < .01));
  await player.page.evaluate(() => { window.__paintRelease.dropPreviews = false; });
  const beforeDuplicate = await state(player.page);
  await player.page.evaluate(() => {
    const p = window.__paintRelease;
    p.sockets.find(ws => ws.readyState === WebSocket.OPEN).dispatchEvent(new MessageEvent('message', { data: p.lastEvent }));
  });
  assert.deepEqual((await state(player.page)).committed, beforeDuplicate.committed);
  assert.equal((await state(player.page)).revision, beforeDuplicate.revision);
  const contextSnapshot = beforeDuplicate.committed;
  await player.page.mouse.move(point.x, point.y); await player.page.mouse.down();
  await player.page.waitForFunction(() => window.__paintRelease.interaction.getState().gestureActive);
  await player.page.evaluate(() => {
    const canvas = [...document.querySelectorAll('canvas')].find(value => value.tabIndex === 0);
    window.__paintRelease.contextExtension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    window.__paintRelease.contextExtension.loseContext();
  });
  await player.page.waitForFunction(() => window.__paintRelease.runtime.store.getSnapshot().isContextLost);
  await player.page.waitForFunction(() => !window.__paintRelease.interaction.getState().gestureActive);
  await player.page.mouse.up();
  await player.page.evaluate(() => window.__paintRelease.contextExtension.restoreContext());
  await player.page.waitForFunction(() => !window.__paintRelease.runtime.store.getSnapshot().isContextLost
    && window.__paintRelease.runtime.getRenderEngine());
  await converge(player.page, dm.page, 2);
  assert.deepEqual((await state(player.page)).committed, contextSnapshot);
  await player.page.evaluate(tableId => {
    const p = window.__paintRelease;
    p.holdSnapshots = true;
    p.paint.selectTable(tableId);
  }, fixture.busyTableId);
  await player.page.waitForFunction(() => window.__paintRelease.heldChunks.length > 1);
  await player.page.evaluate(tableId => {
    const p = window.__paintRelease;
    p.holdSnapshots = false;
    p.paint.selectTable(tableId);
    p.replaying = true;
    for (const raw of p.heldChunks) p.sockets.find(ws => ws.readyState === WebSocket.OPEN)
      .dispatchEvent(new MessageEvent('message', { data: raw }));
    p.heldChunks = []; p.replaying = false;
  }, fixture.tableId);
  await converge(player.page, dm.page, 2);
  assert.deepEqual((await state(player.page)).committed, contextSnapshot);
  report.stages.push('trusted touch dot, pen pressure with all previews dropped, duplicate event, active-gesture context loss/restore, stale chunks after table switch');
  await reconnectProbeClients(others);
  for (const index of [3, 4]) {
    const value = others.find(actor => actor.index === index);
    const own = { ...editable(dot), id: crypto.randomUUID() };
    const operationId = crypto.randomUUID();
    await send(value.page, 'paint_object_create', { operation_id: operationId, table_id: fixture.tableId, object: own });
    await converge(player.page, dm.page, 3);
    let canonical = (await state(player.page)).committed.find(object => object.id === own.id);
    assert.equal(canonical.created_by, fixture.actors[index].id);
    own.transform.x += 15;
    await send(value.page, 'paint_object_update', { operation_id: crypto.randomUUID(), table_id: fixture.tableId,
      id: canonical.id, expected_version: canonical.version, object: own });
    await player.page.waitForFunction(id => window.__paintRelease.paint.getState().committed.find(o => o.id === id)?.version === 2, own.id);
    canonical = (await state(player.page)).committed.find(object => object.id === own.id);
    await send(value.page, 'paint_object_delete', { operation_id: crypto.randomUUID(), table_id: fixture.tableId,
      id: canonical.id, expected_version: canonical.version });
    await converge(player.page, dm.page, 2);
  }
  const coDm = others.find(actor => actor.index === 3);
  const foreignDot = (await state(player.page)).committed[0];
  const dotEdit = editable(foreignDot); dotEdit.style.width = 6;
  await send(coDm.page, 'paint_object_update', { operation_id: crypto.randomUUID(), table_id: fixture.tableId,
    id: foreignDot.id, expected_version: foreignDot.version, object: dotEdit });
  await player.page.waitForFunction(id => window.__paintRelease.paint.getState().committed.find(o => o.id === id)?.version === 2, foreignDot.id);
  await converge(player.page, dm.page, 2);
  report.stages.push('co-DM and trusted player create/update/delete their own objects; co-DM edits a foreign object');
  const legacySample = structuredClone(fixture.legacySample);
  // Relocate one real converter output for an unobscured pixel sample; geometry,
  // pressure, width and color remain exactly as produced from the source row.
  legacySample.transform.x = 100; legacySample.transform.y = 350;
  await dm.page.evaluate(object => window.__paintRelease.paint.submitCreate(object), legacySample);
  await converge(player.page, dm.page, 3);
  const legacyPixel = await dm.page.evaluate(object => {
    const p = window.__paintRelease;
    const engine = p.runtime.getRenderEngine();
    const point = object.geometry.points[50];
    const [x, y] = engine.world_to_screen(object.transform.x + point.x, object.transform.y + point.y);
    engine.render();
    const canvas = [...document.querySelectorAll('canvas')].find(value => value.tabIndex === 0);
    const gl = canvas.getContext('webgl2');
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.round(x), canvas.height - 1 - Math.round(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
  }, legacySample);
  for (let channel = 0; channel < 3; channel += 1) assert(Math.abs(legacyPixel[channel]
    - Math.round(legacySample.style.stroke_rgba[channel] * 255)) <= 25, `Converted sample pixel ${legacyPixel}`);
  report.legacySamplePixel = legacyPixel;
  report.stages.push('actual legacy converter output persists and renders the expected stroke color in real WebGL');
  console.log('Ten-client load: hydrating 1,000 objects / 100,000 points');
  await Promise.all([player.page, dm.page].map(page => page.evaluate(tableId => {
    window.__paintRelease.reverseSnapshots = true;
    window.__paintRelease.paint.selectTable(tableId);
    window.__paintRelease.runtime.getRenderEngine().set_camera(0, 0, 0.6 * devicePixelRatio);
  }, fixture.busyTableId)));
  await converge(player.page, dm.page, 1000);
  const busy = (await state(player.page)).committed;
  assert.equal(busy.reduce((sum, object) => sum + object.geometry.points.length, 0), 100000);
  const snapshots = await Promise.all([player.page, dm.page].map(page => page.evaluate(() =>
    window.__paintRelease.snapshots.at(-1))));
  for (const snapshot of snapshots) {
    assert(snapshot.chunks > 1, 'Busy fixture must exercise multi-chunk hydration');
    assert(snapshot.ms <= report.thresholds.snapshotMaxMs);
    assert(snapshot.bytes <= 32 * 1024 * 1024);
  }
  for (const value of others) {
    await value.page.evaluate(tableId => {
      const p = window.__paintRelease;
      p.snapshotData = new Map();
      p.socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.type !== 'paint_snapshot_chunk') return;
        const data = message.data;
        let chunks = p.snapshotData.get(data.snapshot_id);
        if (!chunks) { chunks = new Map(); p.snapshotData.set(data.snapshot_id, chunks); }
        chunks.set(data.chunk_index, data.objects);
        if (chunks.size === data.chunk_count) {
          p.confirmed = { revision: data.revision,
            objects: [...chunks.entries()].sort(([a], [b]) => a - b).flatMap(([, objects]) => objects) };
          p.snapshotData.clear();
        }
      });
      p.socket.send(JSON.stringify({ type: 'paint_snapshot_request', data: { table_id: tableId }, message_id: crypto.randomUUID() }));
    }, fixture.busyTableId);
    await value.page.waitForFunction(() => window.__paintRelease.confirmed?.objects.length === 1000);
  }
  report.browser = await browser.version();
  report.graphics = await player.page.evaluate(() => {
    const canvas = [...document.querySelectorAll('canvas')].find(value => value.tabIndex === 0);
    const gl = canvas.getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      width: canvas.width, height: canvas.height, dpr: devicePixelRatio, platform: navigator.userAgent };
  });
  await player.page.evaluate(() => { window.__paintRelease.frames = []; });
  await player.page.waitForFunction(() => window.__paintRelease.frames.length >= 120);
  await Promise.all(clients.map(value => value.page.evaluate(() => {
    window.__paintRelease.commands = []; window.__paintRelease.messages = []; window.__paintRelease.peakQueuedBytes = 0;
  })));
  const baseline = await player.page.evaluate(() => {
    const p = window.__paintRelease;
    p.frames = []; p.previews = []; p.commands = []; p.messages = [];
    p.revisionGaps = 0; p.requestCount = 0; p.inputTracking = true;
    return { buffers: p.liveBuffers.size, meshRebuilds: p.runtime.getRenderEngine().paint_object_mesh_rebuild_count() };
  });
  const cdp = await player.context.newCDPSession(player.page);
  await cdp.send('HeapProfiler.collectGarbage');
  const heapBefore = await cdp.send('Runtime.getHeapUsage');
  const wasmBefore = await player.page.evaluate(() => window.__paintRelease.wasmMemory?.buffer.byteLength);
  assert(wasmBefore > 0, 'WASM linear memory must be measured, not omitted');
  const memorySamples = [{ batch: 0, usedHeapBytes: heapBefore.usedSize,
    backingStorageBytes: heapBefore.backingStorageSize, wasmBytes: wasmBefore }];
  const serverBefore = await serverMetrics();
  await player.page.getByRole('button', { name: 'Draw', exact: true }).click();
  for (let gesture = 0; gesture < 5; gesture += 1) {
    const a = await coordinates(player.page, 100, 1060);
    const b = await coordinates(player.page, 200, 1080);
    await player.page.mouse.move(a.x, a.y); await player.page.mouse.down();
    await player.page.mouse.move(b.x, b.y, { steps: 8 });
    await player.page.keyboard.press('Escape'); await player.page.mouse.up();
  }
  const eventLatencies = [];
  const acceptedOperations = [];
  const writers = [dm, player, ...others.filter(value => value.index !== 2)];
  for (let round = 0; round < 12; round += 1) {
    const canonical = (await state(player.page)).committed;
    const operations = writers.map(value => {
      const object = canonical.find(o => o.created_by === fixture.actors[value.index].id);
      assert(object, `No fixture path for writer ${value.index}`);
      const replacement = editable(object);
      replacement.transform.x += round % 2 === 0 ? 0.25 : -0.25;
      return { value, operationId: crypto.randomUUID(), object, replacement };
    });
    const startedAt = Date.now();
    await Promise.all(operations.map(({ value, operationId, object, replacement }) => send(value.page,
      'paint_object_update', { operation_id: operationId, table_id: fixture.busyTableId, id: object.id,
        expected_version: object.version, object: replacement })));
    for (const operation of operations) {
      await player.page.waitForFunction(id => window.__paintRelease.messages.some(message => message.operationId === id), operation.operationId);
      const received = await player.page.evaluate(id => window.__paintRelease.messages.find(message => message.operationId === id), operation.operationId);
      assert.equal(received.type, 'paint_object_event', `Load command rejected: ${received.code}`);
      eventLatencies.push(received.receivedAt - startedAt);
      acceptedOperations.push(operation.operationId);
    }
    await converge(player.page, dm.page, 1000);
    if ((round + 1) % 4 === 0) {
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      memorySamples.push({ batch: round + 1, usedHeapBytes: heap.usedSize, backingStorageBytes: heap.backingStorageSize,
        wasmBytes: await player.page.evaluate(() => window.__paintRelease.wasmMemory.buffer.byteLength) });
      console.log(`Ten-client load: ${round + 1}/12 concurrent edit batches accepted`);
    }
  }
  await player.page.waitForFunction(() => window.__paintRelease.frames.length >= 300);
  await cdp.send('HeapProfiler.collectGarbage');
  const heapAfter = await cdp.send('Runtime.getHeapUsage');
  const metrics = await player.page.evaluate(() => {
    const p = window.__paintRelease;
    return { frames: p.frames, previews: p.previews, buffers: p.liveBuffers.size,
      revisionGaps: p.revisionGaps, resyncs: p.requestCount,
      queuedBytes: Math.max(...p.sockets.map(ws => ws.bufferedAmount)),
      peakQueuedBytes: p.peakQueuedBytes,
      meshRebuilds: p.runtime.getRenderEngine().paint_object_mesh_rebuild_count(),
      diagnostics: p.runtime.getRenderDiagnostics() };
  });
  const commandSamples = (await Promise.all(clients.map(value => value.page.evaluate(() => window.__paintRelease.commands)))).flat();
  const socketMetrics = await Promise.all(clients.map(value => value.page.evaluate(() => {
    const p = window.__paintRelease;
    return { queuedBytes: Math.max(0, ...p.sockets.map(ws => ws.bufferedAmount)), peakQueuedBytes: p.peakQueuedBytes,
      rejected: p.messages.filter(message => message.type === 'error').length };
  })));
  const serverAfter = await serverMetrics();
  await writeFile(join(fixture.evidenceDir, 'server-metrics.prom'), serverAfter.raw);
  report.load = { connectedClients: 10, interactiveWriters: 9, acceptedCommands: acceptedOperations.length,
    objects: 1000, points: 100000, snapshots, previewMs: summarize(metrics.previews),
    frameCpuMs: summarize(metrics.frames), committedEventMs: summarize(eventLatencies),
    commandRoundTripMs: summarize(commandSamples), buffersBefore: baseline.buffers, buffersAfter: metrics.buffers,
    heapBefore: heapBefore.usedSize, heapAfter: heapAfter.usedSize, memorySamples,
    revisionGaps: metrics.revisionGaps, resyncs: metrics.resyncs,
    queuedBytes: Math.max(...socketMetrics.map(value => value.queuedBytes)),
    peakQueuedBytes: Math.max(...socketMetrics.map(value => value.peakQueuedBytes)),
    rejectedCommands: socketMetrics.reduce((sum, value) => sum + value.rejected, 0),
    serverCommandMs: serverLatency(serverBefore, serverAfter),
    diagnostics: metrics.diagnostics };
  console.log(`PAINT_LOAD ${JSON.stringify(report.load)}`);
  assert(report.load.previewMs.p95 <= report.thresholds.previewP95Ms);
  assert(report.load.frameCpuMs.mean <= report.thresholds.frameMeanMs);
  assert(report.load.frameCpuMs.p95 <= report.thresholds.frameP95Ms);
  assert(report.load.committedEventMs.p95 <= report.thresholds.eventP95Ms);
  assert(report.load.commandRoundTripMs.p95 <= report.thresholds.commandP95Ms);
  assert(report.load.serverCommandMs.p95UpperBoundMs <= report.thresholds.commandP95Ms);
  assert.equal(metrics.buffers, baseline.buffers);
  assert(heapAfter.usedSize - heapBefore.usedSize <= report.thresholds.heapGrowthBytes);
  for (const sample of memorySamples) {
    assert(sample.usedHeapBytes - memorySamples[0].usedHeapBytes <= report.thresholds.heapGrowthBytes);
    assert(sample.backingStorageBytes - memorySamples[0].backingStorageBytes <= report.thresholds.heapGrowthBytes);
    assert.equal(sample.wasmBytes, wasmBefore, 'Retained WASM memory must stay stable after warm-up');
  }
  assert.equal(metrics.revisionGaps, 0); assert.equal(metrics.resyncs, 0); assert.equal(metrics.queuedBytes, 0);
  assert.equal(report.load.rejectedCommands, 0); assert.equal(report.load.queuedBytes, 0);
  assert(report.load.peakQueuedBytes <= 64 * 1024);
  assert.equal(metrics.meshRebuilds - baseline.meshRebuilds, acceptedOperations.length);
  const finalState = await state(player.page);
  assert.equal(finalState.revision, acceptedOperations.length);
  for (const value of others) {
    await send(value.page, 'paint_snapshot_request', { table_id: fixture.busyTableId });
    await value.page.waitForFunction(rev => window.__paintRelease.confirmed?.revision === rev, finalState.revision);
    const fresh = await value.page.evaluate(() => window.__paintRelease.confirmed);
    assert.deepEqual(fresh.objects, finalState.committed);
  }
  report.stages.push('ten clients converge under load: zero gaps, resyncs, lost updates and retained-buffer growth');
  console.log('Browser acceptance passed; evidence collection');
  report.browser = await browser.version();
  report.graphics = await player.page.evaluate(() => {
    const canvas = [...document.querySelectorAll('canvas')].find(value => value.tabIndex === 0);
    const gl = canvas.getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      width: canvas.width, height: canvas.height, dpr: devicePixelRatio, platform: navigator.userAgent };
  });
  assert.deepEqual(failures, [], 'Unexpected browser runtime errors');
} catch (error) {
  report.failure = error.stack;
  report.browserErrors = failures;
  for (const { page, index } of clients.filter(value => value.full)) {
    await page.screenshot({ path: join(fixture.evidenceDir, `failure-${index}.png`) }).catch(() => {});
    await writeFile(join(fixture.evidenceDir, `failure-${index}.txt`), await page.locator('body').innerText().catch(() => ''));
    await writeFile(join(fixture.evidenceDir, `failure-${index}-state.json`), JSON.stringify(await state(page).catch(() => null), null, 2));
  }
  throw error;
} finally {
  await writeFile(join(fixture.evidenceDir, 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
