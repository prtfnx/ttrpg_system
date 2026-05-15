# Web-UI Test Coverage Increase Plan

## Current State (May 2026)

| Metric | Value |
|--------|-------|
| Overall lines | **33.77%** |
| Overall branches | 25.12% |
| Overall functions | 31.74% |
| Total test files | 81 |
| Total tests | 1273 |
| Test runner | Vitest (v8 provider, jsdom + browser projects) |

Run: `cd apps/web-ui && npx vitest run --coverage`

---

## Principles (best practice)

1. **Test behaviour, not implementation.** Use RTL `screen.getBy*` queries over component internals.
2. **Mock at the boundary.** Mock `@/store`, external APIs, WebSocket — not internal helpers.
3. **One concept per test.** A test should fail for exactly one reason.
4. **Prefer `userEvent` over `fireEvent`** for interactive components (closer to real user).
5. **`vi.stubEnv` / `vi.useFakeTimers`** for environment and timing — reset with `afterEach`.
6. **Skip trivial re-exports.** `index.ts` barrel files with 0% are fine to exclude from coverage.
7. **Avoid snapshot tests** for large component trees — they break on any markup change and add no behaviour value.

---

## File Exclusions (add to `vitest.config.ts` coverage.exclude)

These are barrel re-exports or CSS — no logic to test:

```ts
'**/index.ts',           // barrel re-exports
'**/*.module.css',       // CSS modules
'**/*.d.ts',             // type declarations
'**/vite-env.d.ts',
'**/wasm.d.ts',
'src/test/**',
```

Excluding these will increase effective coverage % without writing a single test.

---

## Coverage Targets by Priority

### Priority 1 — Pure Logic (0 dependencies, highest ROI)

| File | Lines | What to test |
|------|-------|--------------|
| `src/features/table/utils.ts` | 13% | table formatting helpers |
| `src/features/assets/assetCache.ts` | 9% | cache get/set/evict logic |
| `src/shared/utils/toast.ts` | 63% → 100% | remaining toast variants (done partially) |
| `src/shared/utils/logger.ts` | 37% → 100% | dev/prod mode branches (done partially) |
| `src/features/character/components/CharacterWizard/raceData.ts` | 3% | lookup functions |

**How:** Pure unit tests, no mocks needed. `describe` per function, test all branches.

---

### Priority 2 — Zustand Stores (already proven pattern)

| File | Lines | What to test |
|------|-------|--------------|
| `src/store.ts` | 58% | missing: `setSprites`, `updateWall`, table actions (line 834+) |
| `src/features/compendium/useCompendium.ts` | 34% | search/filter/load states |
| `src/features/table/useTableSync.ts` | 29% | sync state transitions |
| `src/shared/hooks/useActions.ts` | 30% | dispatch, undo/redo queue |

**Pattern:** Test store actions directly — call action, assert new state. No component needed.

```ts
it('addSprite inserts sprite into sprites map', () => {
  const { addSprite, sprites } = useGameStore.getState();
  addSprite({ id: 's1', ... });
  expect(useGameStore.getState().sprites['s1']).toBeDefined();
});
```

---

### Priority 3 — React Components (RTL, mock store)

#### 3a. Stateless / display components (easiest)

| File | Lines | Tests needed |
|------|-------|--------------|
| `src/features/table/components/SyncBadge.tsx` | 20% | renders synced/pending/error states |
| `src/features/table/components/TableCard.tsx` | 5% | renders table name, calls onSelect |
| `src/features/session/components/InviteLink.tsx` | 5% | renders link, copy button |
| `src/features/canvas/components/GridSettings.tsx` | 3% | renders fields, calls onChange |
| `src/features/canvas/components/GridControls.tsx` | 0% | zoom in/out, reset buttons |
| `src/features/auth/components/LoginModal.tsx` | 2% | renders form, submit calls handler |
| `src/features/auth/components/UserMenu.tsx` | 20% | shows username, logout button |
| `src/features/auth/components/AuthGuard.tsx` | 7% | redirects unauthenticated users |
| `src/features/combat/components/CombatLog.tsx` | 0% | renders log entries |
| `src/features/character/components/CharacterWizard/ClassStep.tsx` | 0% | renders class list |
| `src/features/character/components/CharacterWizard/ReviewStep.tsx` | 25% | renders review summary |

**Pattern:**
```tsx
vi.mock('@/store', () => ({ useGameStore: (sel) => sel(mockState) }));

it('SyncBadge shows "Synced" when status is idle', () => {
  render(<SyncBadge status="idle" />);
  expect(screen.getByText(/synced/i)).toBeTruthy();
});
```

#### 3b. Interactive components (RTL + userEvent)

| File | Lines | Tests needed |
|------|-------|--------------|
| `src/features/canvas/components/LayerPanel.tsx` | 82% → 90%+ | remaining toggle/opacity |
| `src/features/chat/components/ChatPanel.tsx` | 44% | send message, display messages |
| `src/features/combat/components/TurnBanner.tsx` | 58% | shows current turn, next/end |
| `src/features/character/components/InventoryTab.tsx` | 65% | add/remove items |
| `src/features/painting/components/PaintPanel.tsx` | 38% | brush select, color change |
| `src/features/table/components/TablePanel.tsx` | 53% | table select, create |
| `src/features/table/components/TablePreview.tsx` | 49% | preview render |

**Pattern:**
```tsx
import userEvent from '@testing-library/user-event';

it('sends message when Enter pressed', async () => {
  const user = userEvent.setup();
  render(<ChatPanel />);
  await user.type(screen.getByRole('textbox'), 'hello{Enter}');
  expect(screen.getByText('hello')).toBeTruthy();
});
```

---

### Priority 4 — Service / Hook Classes

| File | Lines | Tests needed |
|------|-------|--------------|
| `src/features/auth/auth.service.ts` | 25% | login success/fail, token refresh, logout |
| `src/lib/websocket/` (WebSocketService) | 37% | connect/disconnect, message routing |
| `src/lib/wasm/wasmBridge.ts` | 22% | bridge calls with mocked WASM module |
| `src/lib/wasm/wasmManager.ts` | 26% | init, load, error handling |
| `src/shared/hooks/useWebSocket.ts` | 14% | connect on mount, reconnect logic |
| `src/features/canvas/services/InputManager.ts` | 85% → 95%+ | edge cases (shift+z redo) |
| `src/app/providers/AuthProvider.tsx` | 40% | auth context propagation |

**Pattern for services:** Instantiate the class, mock fetch/WebSocket, assert behavior.

```ts
vi.stubGlobal('WebSocket', MockWebSocket);

it('reconnects after disconnect', async () => {
  const ws = new WebSocketService('ws://test');
  ws.connect();
  ws.socket?.close();
  await vi.advanceTimersByTimeAsync(3000);
  expect(ws.isConnected).toBe(true);
});
```

---

### Priority 5 — Large Components (high complexity, defer)

| File | Lines | Difficulty |
|------|-------|-----------|
| `src/features/canvas/components/GameCanvas.tsx` | 39% | High — WebGL + WASM + canvas |
| `src/features/canvas/components/ToolsPanel.tsx` | 0.4% | High — 664 lines, many tool modes |
| `src/features/assets/AssetManager.tsx` | 0.9% | High — file upload, R2 integration |
| `src/features/fog/components/FogPanel.tsx` | 16% | Medium — fog draw controls |
| `src/features/canvas/components/GameClient.tsx` | 59% → 70% | Medium — orchestrator component |

**Strategy for GameCanvas/ToolsPanel:** Don't try to render the whole component.
Test slices: extract pure helper functions, test those. Use `/* v8 ignore start -- @preserve */` on WebGL shader code that is inherently untestable.

---

## Step-by-Step Execution Plan

### Step 1 — Config: Exclude barrel files (30 min)
- Add `'**/index.ts'` to `coverage.exclude` in `vitest.config.ts`
- Verify overall % jumps due to removed 0% files
- Commit: `chore(web-ui): exclude barrel index.ts from coverage`

### Step 2 — Pure logic utils (1 session)
- `table/utils.ts` — test formatting functions
- `assets/assetCache.ts` — cache lifecycle
- `character/raceData.ts` — lookup/filter functions
- Commit: `test(web-ui): cover pure utility functions`

### Step 3 — Store gaps in store.ts (1 session)
- Find all uncovered lines in `store.ts` (lines 834, 847-848, 863)
- Add tests directly to `src/__tests__/store.test.ts`
- Target: 58% → 80%+
- Commit: `test(web-ui): extend store.ts coverage`

### Step 4 — Display components batch (1-2 sessions)
- `SyncBadge`, `TableCard`, `GridSettings`, `GridControls` (all < 20%)
- `LoginModal`, `UserMenu`, `AuthGuard`
- `CombatLog`, `TurnBanner`
- Target each file: 0% → 70%+
- Commit per logical group: `test(web-ui): cover display components — auth`

### Step 5 — Zustand hooks and useCompendium (1 session)
- `useCompendium.ts` (34%) — test search, loading states, pagination
- `useTableSync.ts` (29%) — sync state transitions
- `useActions.ts` (30%) — dispatch, queue operations
- Commit: `test(web-ui): cover zustand hooks`

### Step 6 — Auth service (1 session)
- Mock `fetch` with `vi.fn()` returning responses
- Test `login`, `logout`, `refreshToken`, error paths
- Target: 25% → 75%+
- Commit: `test(web-ui): cover auth.service`

### Step 7 — WebSocket layer (1 session)
- Mock `WebSocket` global via `vi.stubGlobal`
- Test message dispatch, reconnect, send-when-disconnected
- Target: 37% → 65%+
- Commit: `test(web-ui): cover WebSocketService`

### Step 8 — WASM bridge (1 session)
- Mock the WASM module itself (`vi.mock('@lib/wasm')`)
- Test `wasmBridge` calls forward to correct WASM functions
- Test `wasmManager` init/error/load states
- Commit: `test(web-ui): cover wasm bridge and manager`

### Step 9 — Interactive components (2 sessions)
- `ChatPanel` — send/receive messages
- `PaintPanel` — tool mode switching
- `TablePanel` / `TablePreview` — selection, preview rendering
- Commit per feature area

### Step 10 — GameCanvas / ToolsPanel (last, optional)
- Extract any pure logic into separate files/hooks first
- Mark WebGL-specific blocks with `/* v8 ignore start -- @preserve */`
- Only test the React layer (props, state, hook calls)
- This is a refactor + test exercise

---

## Expected Coverage Progress

| After Step | Estimated Lines |
|-----------|----------------|
| Now | ~34% |
| Step 1 (config) | ~38% |
| Steps 2-3 | ~45% |
| Steps 4-5 | ~55% |
| Steps 6-7 | ~62% |
| Steps 8-9 | ~68% |
| Step 10 | ~72% |

**Realistic target: 65-70% lines** without mocking WebGL/canvas internals.

---

## Tools & Patterns Reference

```ts
// Mock store selector
vi.mock('@/store', () => ({
  useGameStore: (sel?: (s: any) => any) => sel ? sel(mockState) : mockState,
}));

// Mock env variable
vi.stubEnv('DEV', 'true');
afterEach(() => vi.unstubAllEnvs());

// Fake timers for reconnect/debounce
vi.useFakeTimers();
await vi.advanceTimersByTimeAsync(5000);
vi.useRealTimers();

// Mock fetch
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true, json: () => Promise.resolve({ token: 'abc' })
}));

// Mock WebSocket
class MockWS { send = vi.fn(); close = vi.fn(); }
vi.stubGlobal('WebSocket', vi.fn(() => new MockWS()));

// RTL user interactions
import userEvent from '@testing-library/user-event';
const user = userEvent.setup();
await user.click(screen.getByRole('button', { name: /submit/i }));
await user.type(screen.getByRole('textbox'), 'hello');
```

---

## Deep-Dive: Complex Component Strategies

### ToolsPanel.tsx (664 lines, 0.4% coverage)

**Architecture summary:**
- Inner `PlayerLayerControls` sub-component: toggles map/tokens layer via `useGameStore` + `window.rustRenderManager.set_layer_visible`
- Main component: 4 tabs (tools / lighting / layers / dev), visibility driven by role (`isDM`, `isElevated`)
- Renders: `PaintPanel`, `TextSpriteTool`, `WallConfigModal`, `PolygonConfigModal`, `GameModeSwitch`, `DMCombatPanel`, `FloatingInitiativeTracker`, `DiceRoller`, `MeasurementTool`, `AlignmentHelper`, `AssetManager`, `OAWarningModal`, `OAPrompt`
- Props: `{ userInfo: UserInfo }`
- Key side-effects: `ProtocolService.getProtocol().switchAllPlayersToTable()`, `startDmPreview`/`stopDmPreview` on unmount

**Test file:** `src/features/canvas/components/__tests__/ToolsPanel.test.tsx`

**Mock strategy — mock at the module boundary, stub all sub-components:**
```ts
vi.mock('@features/assets', () => ({ AssetManager: () => null }))
vi.mock('@features/combat', () => ({
  DMCombatPanel: () => null,
  FloatingInitiativeTracker: () => null,
  GameModeSwitch: () => null,
  OAPrompt: () => null,
  OAWarningModal: () => null,
  useOAStore: vi.fn(() => ({ warningEntityId: null, prompt: null, clearAll: vi.fn() })),
}))
vi.mock('@features/lighting', () => ({ startDmPreview: vi.fn(), stopDmPreview: vi.fn() }))
vi.mock('@features/measurement', () => ({ MeasurementTool: () => null }))
vi.mock('@features/painting', () => ({ PaintPanel: () => null }))
vi.mock('@features/canvas/hooks/useLayerHotkeys', () => ({ useLayerHotkeys: vi.fn() }))
vi.mock('@shared/components', () => ({ AlignmentHelper: () => null, DiceRoller: () => null }))
// mock local siblings
vi.mock('../TextSpriteTool', () => ({ TextSpriteTool: () => null }))
vi.mock('../WallConfigModal', () => ({ WallConfigModal: () => null }))
vi.mock('../PolygonConfigModal', () => ({ PolygonConfigModal: () => null }))
vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(() => false),
    getProtocol: vi.fn(() => ({
      isPingEnabled: vi.fn(() => false),
      startPing: vi.fn(), stopPing: vi.fn(),
      switchAllPlayersToTable: vi.fn(),
      sendTableSettingsUpdate: vi.fn(),
      removeWall: vi.fn(), toggleDoor: vi.fn(),
    })),
  },
}))
```

**Store setup helper (reuse across tests):**
```ts
const dmState = {
  sessionRole: 'owner', activeTableId: 'table1',
  tables: [{ id: 'table1', name: 'Main' }, { id: 'table2', name: 'Alt' }],
  walls: [], activeTool: 'select', activeLayer: 'tokens',
  mapLayerVisible: true, tokensLayerVisible: true,
};
beforeEach(() => useGameStore.setState(dmState));
afterEach(() => useGameStore.setState(defaultState));
```

**Test groups (25 tests target):**

1. **PlayerLayerControls — 5 tests**
   - Renders map and tokens visibility toggles
   - Clicking map toggle calls `rustRenderManager.set_layer_visible('map', false)`
   - Clicking again re-enables
   - State reflects in button aria-pressed / CSS class
   - Note: set `(window as any).rustRenderManager = { set_layer_visible: vi.fn() }` in beforeEach

2. **Tab visibility by role — 4 tests**
   - DM (`sessionRole: 'owner'`) sees tools / lighting / layers / dev tabs
   - Player (`sessionRole: 'player'`) sees only tools tab
   - Elevated role sees tools + lighting + layers
   - No table selected: table switcher not rendered

3. **Tools tab — primary toolbar — 4 tests**
   - Clicking "Select" button calls `setActiveTool('select')`
   - Clicking "Rectangle" calls `setActiveTool('rectangle')`
   - Active tool button has active CSS state
   - Wall list rendered when DM + table + walls present

4. **Table switcher — 3 tests**
   - Renders current table name
   - Clicking opens dropdown with other tables
   - Selecting table calls `ProtocolService.getProtocol().switchAllPlayersToTable('table2')`

5. **Wall list — 3 tests**
   - Renders walls from store
   - Remove wall button calls `ProtocolService.getProtocol().removeWall(wallId)`
   - "Clear all" button removes all walls

6. **Lighting tab — 3 tests** (requires DM + activeTableId + dynamicLightingEnabled)
   - Ambient light slider onChange updates store
   - Fog mode select calls store action
   - Dynamic lighting toggle calls store action

7. **Dev tab — 2 tests**
   - Ping toggle calls `ProtocolService.getProtocol().startPing()` when off
   - Calls `stopPing()` when already on

8. **Cleanup effect — 1 test**
   - Unmounting with `dmPreviewUserId` set calls `stopDmPreview`

---

### GameCanvas.tsx (~550 lines, 0% coverage)

**Architecture summary:**
- Multiple `useRef` for main canvas, preview canvas, wall overlay canvas, vision rings canvas, WASM engine, DPR
- Hooks: `useCanvasDebug`, `useFPS`, `usePerformanceMonitor`, `useContextMenu`, `useLightPlacement`, `useCanvasEventsEnhanced`, `useSpriteDragSync`, `useSpriteSyncing`, `useWasmBridge`
- Sub-directory (`GameCanvas/`): `CanvasRenderer.tsx`, `canvasUtils.ts`, `useContextMenu.ts`, `useCanvasEventsEnhanced.ts`, `useCanvasState.ts`
- Animation loops: `requestAnimationFrame` for vision rings and wall overlay rendering
- Custom events: `sprite-drag-preview`, `sprite-resize-preview`, `sprite-moved`
- WebSocket via `useWebSocket`

**Best practice:** Don't test the full component — test the extracted hooks in isolation. For the component shell, mock all hooks and assert only the React layer.

**Test files:**
- `GameCanvas/__tests__/useContextMenu.test.ts` — hook logic in isolation
- `GameCanvas/__tests__/useCanvasEventsEnhanced.test.ts` — event handler wiring
- `GameCanvas/__tests__/canvasUtils.test.ts` — pure geometry/coord helpers
- `GameCanvas/__tests__/GameCanvas.test.tsx` — component shell (minimal)

#### `useContextMenu` hook — 8 tests
The hook is pure React state + callbacks, no WASM in the happy path:
```ts
// renderHook pattern
const mockRefs = {
  canvasRef: { current: document.createElement('canvas') },
  rustRenderManagerRef: { current: { delete_sprite: vi.fn(), copy_sprite: vi.fn(), ... } },
};
const { result } = renderHook(() => useContextMenu({ ...mockRefs, protocol: null }));
```
- Initial state: `visible: false`
- `handleContextMenuAction('delete')` without protocol calls `rustRenderManager.delete_sprite`
- `handleContextMenuAction('delete')` with protocol calls `protocol.removeSprite`
- `handleContextMenuAction('copy')` populates `copiedSprite`
- `handleContextMenuAction('paste')` calls WASM paste method
- `handleMoveToLayer('tokens')` calls WASM layer move
- `setContextMenu` updates visibility state
- Cleanup: context menu closes on outside click

#### `canvasUtils.ts` — pure function tests (4 tests)
- `getGridCoord(x, y, gridSize)` returns correct cell coords
- Edge: pixel at cell boundary
- `resizeCanvas(canvas, dpr)` sets correct pixel dimensions
- Returns correct logical dimensions

#### GameCanvas component shell — 5 tests
Mock all hooks:
```ts
vi.mock('../hooks/useWasmBridge', () => ({ useWasmBridge: vi.fn(() => ({ isReady: false })) }))
vi.mock('./GameCanvas/useContextMenu', () => ({
  useContextMenu: vi.fn(() => ({
    contextMenu: { visible: false, x: 0, y: 0 },
    setContextMenu: vi.fn(),
    handleContextMenuAction: vi.fn(),
    handleMoveToLayer: vi.fn(),
  })),
}))
vi.mock('./GameCanvas/useCanvasEventsEnhanced', () => ({
  useCanvasEventsEnhanced: vi.fn(() => ({
    stableMouseDown: vi.fn(), stableMouseMove: vi.fn(), stableMouseUp: vi.fn(),
    stableWheel: vi.fn(), stableRightClick: vi.fn(),
  })),
}))
vi.mock('@shared/hooks/useWebSocket', () => ({ useWebSocket: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })) }))
// mock rAF to prevent infinite loop
vi.stubGlobal('requestAnimationFrame', vi.fn())
vi.stubGlobal('cancelAnimationFrame', vi.fn())
```
Tests:
- Renders main `<canvas>` element
- Renders preview canvas
- Renders wall overlay canvas
- `sprite-drag-preview` event listener registered on mount
- Context menu visible when `contextMenu.visible = true` (mock returns visible state)

**What NOT to test in GameCanvas:**
- WASM rendering internals
- rAF animation loop timing
- Canvas 2D draw calls (`fillRect`, `drawImage`, etc.)
- WebGL context creation

---

### AssetPanel.tsx (~200 lines, 0.88% coverage)

**Architecture summary:**
- Uses `useAssetManager` hook for all data/operations
- File drag-and-drop handlers (`handleDrop`, `handleDragOver`)
- File input `onChange`
- `validateFile(file)` — pure validation: size < 50MB, type whitelist (image/*, video/mp4, audio/*)
- `handleFiles(files)` — async loop: validate, upload, update progress state
- Category filter (select element)
- Asset list with remove button

**Test file:** `src/features/assets/components/__tests__/AssetPanel.test.tsx`

**Mock strategy:**
```ts
const mockManager = {
  isInitialized: true,
  stats: { totalAssets: 2, totalSize: 2048 },
  listAssets: vi.fn(() => [
    { id: 'a1', name: 'map.png', size: 1024, type: 'image/png', category: 'maps' },
    { id: 'a2', name: 'token.webp', size: 1024, type: 'image/webp', category: 'tokens' },
  ]),
  removeAsset: vi.fn(),
  uploadAsset: vi.fn(() => Promise.resolve({ id: 'a3' })),
  formatFileSize: vi.fn((b: number) => `${b}B`),
};
vi.mock('../hooks/useAssetManager', () => ({
  useAssetManager: vi.fn(() => mockManager),
}))
```

**Test groups (15 tests target):**

1. **`validateFile` — pure function — 5 tests**
   - Valid image (PNG, < 1MB) → `{ valid: true }`
   - Valid video (mp4, < 50MB) → `{ valid: true }`
   - Oversized file (> 50MB) → `{ valid: false, error: /size/i }`
   - Invalid type (`.exe`) → `{ valid: false, error: /type/i }`
   - Boundary: exactly 50MB → `{ valid: true }` (or false, verify the exact condition)

   ```ts
   // Extract and test directly — no render needed
   import { validateFile } from '../AssetPanel';
   // If not exported, test via upload flow
   ```

2. **Renders asset list — 3 tests**
   - Shows asset names from `listAssets`
   - Shows formatted file size via `formatFileSize`
   - Shows stats (totalAssets count)

3. **Category filter — 2 tests**
   - Selecting "maps" category filters to only map assets
   - Selecting "all" shows all assets

4. **File input / drag-drop — 3 tests**
   - `dragover` event sets drag-active class on container
   - `drop` event with valid file calls `uploadAsset`
   - File input change with valid file calls `uploadAsset`
   - Note: use `fireEvent.drop(container, { dataTransfer: { files: [mockFile] } })`

5. **Remove asset — 1 test**
   - Clicking remove button calls `removeAsset('a1')`

6. **Upload error state — 1 test**
   - `uploadAsset` rejects → error message appears in UI

**Key pattern for file mocking:**
```ts
const makeFile = (name: string, size: number, type: string) =>
  new File(['x'.repeat(size)], name, { type });

// drag-drop
const file = makeFile('map.png', 1024, 'image/png');
fireEvent.drop(dropZone, {
  dataTransfer: { files: [file], types: ['Files'] },
});
```

---

### CombatPreviewService (combatPreview.service.ts) — 0% stmts, ~550 lines

**Architecture summary:**
- Pure static-method class: `getAbilityModifier`, `getProficiencyBonus`, `calculateArmorClass`, `calculateMaxHitPoints`, `calculateSavingThrows`, `calculateSkillModifiers`, `getAttackRolls`, `getSpellcastingInfo`, `simulateCombatRound`
- Zero external dependencies — no fetch, no WebSocket, no WASM, no DOM
- Input: `WizardFormData` (plain object), output: numbers / typed objects
- **HIGHEST ROI of all files** — 100% coverage achievable in one session, no mocks needed

**Test file:** `src/features/combat/services/__tests__/combatPreview.service.test.ts`

**Strategy — pure unit tests, no setup needed:**
```ts
import { CombatPreviewService } from '../combatPreview.service';

describe('getAbilityModifier', () => {
  it.each([
    [10, 0], [11, 0], [12, 1], [8, -1], [20, 5], [1, -5], [30, 10]
  ])('score %i → modifier %i', (score, expected) => {
    expect(CombatPreviewService.getAbilityModifier(score)).toBe(expected);
  });
});

describe('getProficiencyBonus', () => {
  it.each([
    [1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [17, 6], [20, 6]
  ])('level %i → bonus %i', (level, expected) => {
    expect(CombatPreviewService.getProficiencyBonus(level)).toBe(expected);
  });
});
```

**Test groups (30 tests target):**

1. **`getAbilityModifier`** — 7 tests: boundary values (1, 8, 10, 11, 12, 20, 30), formula: `floor((score-10)/2)`
2. **`getProficiencyBonus`** — 6 tests: levels 1, 4, 5, 8, 9, 20 (changes at level 5, 9, 13, 17)
3. **`calculateArmorClass`** — 5 tests:
   - No armor: AC = 10 + dex mod (full dex)
   - Leather armor: AC = 11 + dex mod
   - Chain mail: AC = 13 + min(dex, 2)
   - Plate armor: AC = 18 (no dex)
   - Minimum floor: dex -5 → AC still ≥ 10
4. **`calculateMaxHitPoints`** — 4 tests: fighter level 1 (10+con), barbarian level 1 (12+con), wizard level 1 (6+con), multiclass level 5
5. **`calculateSavingThrows`** — 4 tests: proficient save, non-proficient save, with/without proficiency bonus scaling
6. **`calculateSkillModifiers`** — 4 tests: proficient skill, non-proficient, expertise (double prof)
7. **`getAttackRolls`** — 3 tests: melee with STR, finesse weapon chooses best of STR/DEX, ranged uses DEX
8. **`getSpellcastingInfo`** — 3 tests: wizard uses INT, cleric uses WIS, fighter (non-caster) returns null ability

**Helper for character fixture:**
```ts
const makeChar = (overrides = {}): WizardFormData => ({
  name: 'Test', race: 'human', class: 'fighter',
  strength: 16, dexterity: 14, constitution: 12,
  intelligence: 10, wisdom: 10, charisma: 8,
  advancement: { currentLevel: 1 },
  equipment: { items: [] },
  skills: [],
  ...overrides,
});
```

---

### characterExport.service.ts — 1.36% stmts, ~655 lines

**Architecture summary:**
- Class `CharacterExportService` with methods: `exportToD5e`, `exportToDndBeyond`, `exportToCharacterSheet`, `exportToJSON`, `exportToPDF` (PDF = download link only)
- Pure data transformations: `WizardFormData → D5eCharacterExport | DNDBeyondExport | CharacterSheetExport`
- The only side-effect is `exportToPDF` which calls `window.URL.createObjectURL` and `document.createElement('a').click()`
- Calculated fields: ability modifiers, proficiency bonus, HP, AC, saving throws, skill modifiers — all deterministic

**Test file:** `src/features/character/services/__tests__/characterExport.service.test.ts`

**Strategy — pure unit tests, stub `document.createElement` for PDF test only:**
```ts
import { CharacterExportService } from '../characterExport.service';

const baseChar: WizardFormData = {
  name: 'Thalindra', race: 'elf', class: 'wizard', background: 'sage',
  strength: 8, dexterity: 16, constitution: 12,
  intelligence: 18, wisdom: 14, charisma: 10,
  advancement: { currentLevel: 5 },
  skills: ['arcana', 'history'],
  spells: { cantrips: ['firebolt'], knownSpells: ['magic missile'], preparedSpells: [] },
  equipment: { items: [], gold: 25 },
};
```

**Test groups (20 tests target):**

1. **`exportToD5e`** — 6 tests:
   - Returns object with `source: 'TTRPG_System_Web'`
   - `character.name` matches input
   - `character.abilities.intelligence` = 18
   - `calculated.abilityModifiers.intelligence` = +4 (for score 18)
   - `calculated.proficiencyBonus` = 3 (level 5)
   - `character.spells.cantrips` includes 'firebolt'

2. **`exportToDndBeyond`** — 5 tests:
   - `character.name` matches
   - `character.stats` array has 6 entries (STR=1 through CHA=6)
   - `character.stats[3].value` = 18 (INT is stat ID 4)
   - `character.classes[0].definition.name` = 'wizard'
   - `character.background.definition.name` = 'sage'

3. **`exportToCharacterSheet`** — 5 tests:
   - `character.classAndLevel` contains 'wizard' and '5'
   - `character.abilityScores.intelligence` = 18
   - `character.skills` contains proficient skills
   - `character.combat.armorClass` is a number ≥ 10
   - `character.combat.hitPoints` = level-appropriate value

4. **`exportToJSON`** — 2 tests:
   - Returns valid JSON string
   - Parsed JSON has `character.name`

5. **`exportToPDF`** — 2 tests (with DOM mock):
   ```ts
   const mockAnchor = { href: '', download: '', click: vi.fn() };
   vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);
   vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
   // assert anchor.click() was called
   ```

---

### advancedMeasurement.service.ts — 0.61% stmts, ~285 lines

**Architecture summary:**
- Class `AdvancedMeasurementService` — instantiated as singleton
- Methods: `startMeasurement`, `updateMeasurement`, `completeMeasurement`, `cancelMeasurement`, `clearMeasurements`
- Geometric math: `calculateDistance` (Euclidean), `calculateGridDistance` (D&D Chebyshev: max(|dx|,|dy|)), `calculateAngle` (atan2 in degrees)
- Shape management: `addShape`, `removeShape`, `clearShapes`
- Grid snapping: `snapToGrid` — rounds coords to nearest grid cell
- Spatial indexing: `addToSpatialIndex`, `queryRadius`
- History: undo/redo stack with `maxHistory = 100`
- Callbacks: `subscribe(id, fn)` / `unsubscribe(id)` for event notification

**Test file:** `src/features/measurement/services/__tests__/advancedMeasurement.service.test.ts`

**Strategy — instantiate class, test methods directly:**
```ts
import { AdvancedMeasurementService } from '../advancedMeasurement.service';

let svc: AdvancedMeasurementService;
beforeEach(() => { svc = new AdvancedMeasurementService(); }); // fresh instance per test
```

**Test groups (25 tests target):**

1. **`startMeasurement`** — 3 tests:
   - Returns string ID
   - Measurement is retrievable from `getMeasurement(id)`
   - Fires callback `'measurementStarted'` with measurement data

2. **`updateMeasurement`** — 4 tests:
   - Distance updates correctly: `{x:0,y:0}` → `{x:30,y:40}` → distance = 50
   - Angle updates: `{x:0,y:0}` → `{x:1,y:0}` → angle = 0°; `→ {x:0,y:1}` → 90°
   - Grid distance uses Chebyshev: `{x:0,y:0}` → `{x:3,y:4}` → gridDist = 4 (not 5)
   - Unknown ID is a no-op (no throw)

3. **`completeMeasurement`** — 2 tests:
   - Returns measurement object
   - Adds to history (undo stack grows by 1)

4. **`cancelMeasurement`** — 2 tests:
   - Measurement removed from map
   - `getMeasurement(id)` returns `null` after cancel

5. **`clearMeasurements`** — 2 tests:
   - `clearMeasurements(false)`: only removes non-persistent; persistent stays
   - `clearMeasurements(true)`: removes all

6. **`snapToGrid`** private method via `startMeasurement` with snap enabled — 2 tests:
   - Enable snap in settings, `startMeasurement({x:12, y:17})` → snaps to nearest cell
   - Snap tolerance: exact cell boundary is not moved

7. **Distance geometry math** — 4 tests (via `startMeasurement` + `updateMeasurement`):
   - Pythagorean triple (3,4 → 5)
   - Zero distance (same point)
   - Negative coordinates
   - Large distance (1000 units)

8. **`subscribe` / `unsubscribe` callbacks** — 2 tests:
   - Callback called on `measurementStarted`
   - After `unsubscribe`, callback no longer called

9. **History undo/redo** — 3 tests:
   - `undo()` removes last measurement from active
   - `redo()` restores it
   - Undo past beginning is a no-op

---

### textSpriteUtils.ts — 0% stmts, ~340 lines

**Architecture summary:**
- Three exported async functions: `renderTextSprite`, `createTextSprite`, `updateTextSprite`
- One exported sync function: `deleteTextSprite`
- `renderTextSprite`: Canvas 2D drawing — creates `<canvas>`, measures text, draws background/border/shadow/text, returns `{ canvas, textureId, width, height }`
- `createTextSprite`: calls `renderTextSprite`, sends to `window.gameAPI.sendMessage`, loads into WASM via `window.rustRenderManager.load_texture`
- Canvas is created via `document.createElement('canvas')` — works in jsdom
- WASM and gameAPI must be stubbed on `window`

**Test file:** `src/features/canvas/components/TextSprite/__tests__/textSpriteUtils.test.ts`

**Key setup — mock window globals:**
```ts
const mockRustRenderer = {
  load_texture: vi.fn(),
  add_sprite_to_layer: vi.fn(),
  delete_sprite: vi.fn(),
};
const mockGameAPI = { sendMessage: vi.fn() };

beforeEach(() => {
  (window as Record<string, unknown>).rustRenderManager = mockRustRenderer;
  (window as Record<string, unknown>).gameAPI = mockGameAPI;
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as Record<string, unknown>).rustRenderManager;
  delete (window as Record<string, unknown>).gameAPI;
});
```

**Canvas 2D context in jsdom — jsdom has limited Canvas support. Use a mock:**
```ts
// vitest setup or at top of test file
HTMLCanvasElement.prototype.getContext = vi.fn(function(type) {
  if (type === '2d') {
    return {
      font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1,
      shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
      textBaseline: '',
      scale: vi.fn(), save: vi.fn(), restore: vi.fn(),
      translate: vi.fn(), rotate: vi.fn(),
      clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    };
  }
  return null;
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,test');
```

**Test groups (18 tests target):**

1. **`renderTextSprite` — happy path — 5 tests:**
   - Returns object with `canvas`, `textureId`, `width`, `height`
   - `textureId` contains the spriteId
   - `width` ≥ 50 (minimum), `height` ≥ 30 (minimum)
   - With background: `fillRect` called
   - With border: `strokeRect` called

2. **`renderTextSprite` — text properties — 3 tests:**
   - Multi-line text (splits on `\n`) renders multiple `fillText` calls
   - `textAlign: 'center'` → x calculated as centered
   - With shadow: `shadowBlur` set on context; without: `shadowColor = 'transparent'`

3. **`renderTextSprite` — error path — 1 test:**
   - `getContext` returns `null` → Promise rejects with 'Failed to get 2D rendering context'

4. **`createTextSprite` — 5 tests:**
   - Returns a sprite ID string
   - Calls `window.gameAPI.sendMessage('sprite_create', payload)` with correct text data
   - No `gameAPI` on window → only logs warning, still returns ID
   - After `img.onload` fires: `rustRenderManager.load_texture` called with textureId + img
   - After `img.onload` fires: `rustRenderManager.add_sprite_to_layer` called with correct layer

   ```ts
   // Trigger img.onload synchronously via fake Image
   class FakeImage { onload?: () => void; set src(_: string) { setTimeout(() => this.onload?.(), 0); } }
   vi.stubGlobal('Image', FakeImage);
   ```

5. **`deleteTextSprite` — 2 tests:**
   - Calls `rustRenderManager.delete_sprite(spriteId)`
   - Calls `gameAPI.sendMessage('sprite_delete', { id: spriteId })`
   - No rustRenderManager on window → no throw

6. **`updateTextSprite` — 2 tests:**
   - Calls `delete_sprite` then `add_sprite_to_layer` (replace flow)
   - Calls `gameAPI.sendMessage('sprite_update', payload)` with correct ID

---

### DMCombatPanel.tsx — 0% stmts, ~225 lines

**Architecture summary:**
- Two components: `PreCombatSetup` (no active combat) and `DMCombatPanel` (active combat)
- `DMCombatPanel` renders when `useCombatStore(s => s.combat)` is truthy
- All actions use `ProtocolService.getProtocol()?.sendMessage(createMessage(type, data))`
- Message types: `COMBAT_START`, `COMBAT_END`, `DM_SET_HP`, `DM_SET_TEMP_HP`, `DM_APPLY_DAMAGE`, `CONDITION_ADD`, `DM_SET_RESISTANCES`, `DM_SET_SURPRISED`, `DM_REVERT_ACTION`
- Combatant list: dropdown `<select>` populated from `combat.combatants`
- Surprise checkboxes: multi-select using `toggleSurprisedId`

**Test file:** `src/features/combat/components/__tests__/DMCombatPanel.test.tsx`

**Mock strategy:**
```ts
vi.mock('@lib/api', () => ({
  ProtocolService: { getProtocol: vi.fn() },
}))
vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: { COMBAT_START: 'COMBAT_START', COMBAT_END: 'COMBAT_END',
    DM_SET_HP: 'DM_SET_HP', DM_SET_TEMP_HP: 'DM_SET_TEMP_HP',
    DM_APPLY_DAMAGE: 'DM_APPLY_DAMAGE', CONDITION_ADD: 'CONDITION_ADD',
    DM_SET_RESISTANCES: 'DM_SET_RESISTANCES', DM_SET_SURPRISED: 'DM_SET_SURPRISED',
    DM_REVERT_ACTION: 'DM_REVERT_ACTION' },
}))

// Setup protocol mock
const mockSendMessage = vi.fn();
vi.mocked(ProtocolService.getProtocol).mockReturnValue({
  sendMessage: mockSendMessage,
} as unknown as WebClientProtocol);

// Combatant fixture
const mockCombat = {
  combatants: [
    { combatant_id: 'c1', name: 'Goblin', hp: 10, max_hp: 10 },
    { combatant_id: 'c2', name: 'Player', hp: 20, max_hp: 20 },
  ],
  current_turn: 'c1',
};
```

**Test groups (20 tests target):**

1. **PreCombatSetup (no combat) — 3 tests:**
   - Renders "No active combat" text
   - Renders "Start Combat" button
   - Clicking "Start Combat" calls `sendMessage(COMBAT_START, { table_id: activeTableId })`
   - Setup: `useCombatStore.setState({ combat: null })`

2. **Combat panel renders — 2 tests:**
   - When `combat` is set, does NOT render "No active combat"
   - Combatant names appear in the select dropdown
   - Setup: `useCombatStore.setState({ combat: mockCombat })`

3. **HP management — 3 tests:**
   - Select combatant, type HP value, click "Set" → `sendMessage(DM_SET_HP, { combatant_id: 'c1', hp: 15 })`
   - Empty HP input: clicking "Set" does nothing (guard check)
   - Temp HP: same flow but `DM_SET_TEMP_HP`

4. **Apply damage — 2 tests:**
   - Select combatant, type damage, click "Apply" → `sendMessage(DM_APPLY_DAMAGE, ...)`
   - Empty input guard

5. **Add condition — 2 tests:**
   - Select combatant, choose condition from dropdown, type duration, click "Add"
   - → `sendMessage(CONDITION_ADD, { combatant_id, condition_type: 'poisoned', duration: 3, source: 'dm' })`
   - Default condition is 'poisoned'

6. **Set resistances — 2 tests:**
   - Select combatant, enter "fire, cold" in resistance field → `DM_SET_RESISTANCES` with `resistances: ['fire','cold']`
   - Comma-separated list correctly split + trimmed

7. **Surprise round — 2 tests:**
   - Check a combatant checkbox → `toggleSurprisedId` adds to selection
   - Clicking "Set Surprised" → `sendMessage(DM_SET_SURPRISED, { combatant_ids: ['c1'], surprised: true })`

8. **End combat / revert — 2 tests:**
   - "End Combat" button requires confirm dialog; mock `window.confirm = vi.fn(() => true)` → sends `COMBAT_END`
   - "↩ Revert" → `sendMessage(DM_REVERT_ACTION, {})`

9. **End combat confirm cancelled — 1 test:**
   - `window.confirm` returns `false` → `sendMessage` NOT called

10. **No protocol (null) — 1 test:**
    - `getProtocol` returns `null` → no throw, nothing sent

---

### SpellSelectionStep.tsx — 1.08% stmts, ~540 lines

**Architecture summary:**
- Wizard form step using `react-hook-form` `useFormContext<WizardFormData>`
- Loads spells from `compendiumService.getSpells({ class })` on mount
- Filters: by spell level, school, ritual, concentration, search text — all local state
- `spellManagementService.getSpellSlots(class, level)` — controls available spell levels
- `spellManagementService.getSpellsKnown` — limits selection count
- Toggling spells: cantrips vs known vs prepared spell lists
- Displays spell details on expand

**Test file:** `src/features/character/components/CharacterWizard/__tests__/SpellSelectionStep.test.tsx`

**Mock strategy:**
```ts
vi.mock('@features/compendium/services/compendiumService', () => ({
  compendiumService: {
    getSpells: vi.fn().mockResolvedValue({ spells: {
      'firebolt': { id: 'firebolt', name: 'Fire Bolt', level: 0, school: 'Evocation',
                    description: '...', classes: ['wizard'] },
      'magic-missile': { id: 'magic-missile', name: 'Magic Missile', level: 1,
                         school: 'Evocation', description: '...', classes: ['wizard'] },
    }}),
  },
}))

vi.mock('../../services/spellManagement.service', () => ({
  spellManagementService: {
    getSpellSlots: vi.fn(() => ({ 1: 2, 2: 0 })),
    getSpellsKnown: vi.fn(() => 4),
    getSpellcastingStats: vi.fn(() => ({ spellcastingAbility: 'intelligence', spellSaveDC: 13, spellAttackBonus: 5 })),
    getSpellsForClass: vi.fn((spells) => spells),
  },
}))

// Wrap in react-hook-form context helper
const renderStep = (formValues = {}) => {
  const Wrapper = ({ children }) => {
    const methods = useForm({ defaultValues: { class: 'wizard', advancement: { currentLevel: 1 }, spells: { cantrips: [], knownSpells: [] }, ...formValues } });
    return <FormProvider {...methods}>{children}</FormProvider>;
  };
  return render(<Wrapper><SpellSelectionStep onNext={vi.fn()} /></Wrapper>);
};
```

**Test groups (15 tests target):**

1. **Loading state — 1 test:** Shows loading indicator while `compendiumService.getSpells` is pending
2. **Renders spells after load — 2 tests:** Spell names visible; cantrips and 1st-level spells visible
3. **Search filter — 2 tests:** Type 'fire' → only Fire Bolt visible; clear → all spells return
4. **School filter — 2 tests:** Select 'Evocation' checkbox → filters to evocation spells; deselect → resets
5. **Spell level filter — 2 tests:** Check level 0 → only cantrips shown; check level 1 → only level 1 shown
6. **Toggle cantrap selection — 2 tests:**
   - Click cantrip → added to `cantrips` in form `setValue`
   - Click again → removed (deselect)
7. **Toggle known spell — 2 tests:**
   - Click level 1 spell → added to `knownSpells`
   - At `spellsKnown` limit → further selection is disabled
8. **Expand spell details — 1 test:** Click spell name → description becomes visible
9. **Error state — 1 test:** `compendiumService.getSpells` rejects → error message shown

---

### EquipmentSelectionStep.tsx — 1.45% stmts, ~545 lines

**Architecture summary:**
- Similar wizard step pattern to SpellSelectionStep
- Loads equipment from `equipmentManagementService.getEquipmentForClass(class)` on mount
- Currency system: gold tracking, `CURRENCY_TO_GOLD` conversion, weight limits
- Filter: by category (weapon/armor/adventuring gear/etc.), search term
- `costToGold(cost)` and `formatCost(cost)` — pure helper functions at module top level
- Starting gold: `equipmentManagementService.getStartingGold(class)` — random roll on first mount
- Background starting equipment: loaded from `useBackgrounds()` hook

**Test file:** `src/features/character/components/CharacterWizard/__tests__/EquipmentSelectionStep.test.tsx`

**Pure helper tests first (no render needed):**
```ts
import { costToGold, formatCost } from '../EquipmentSelectionStep';
// Note: these may not be exported — if not, test via rendered output
```

**Mock strategy:**
```ts
vi.mock('../../services/equipmentManagement.service', () => ({
  equipmentManagementService: {
    getEquipmentForClass: vi.fn().mockResolvedValue([
      { name: 'Longsword', category: 'weapon', weight: 3,
        cost: { quantity: 15, unit: 'gp' }, description: '1d8 slashing' },
      { name: 'Leather Armor', category: 'armor', weight: 10,
        cost: { quantity: 10, unit: 'gp' }, description: 'AC 11 + DEX' },
    ]),
    getStartingGold: vi.fn(() => 150), // 150 gp for fighter
    validateEquipmentSelection: vi.fn(() => ({ valid: true, errors: [] })),
  },
  equipmentToWizardItem: vi.fn((eq, qty) => ({ equipment: { name: eq.name, weight: eq.weight, cost: { amount: eq.cost.quantity, unit: eq.cost.unit } }, quantity: qty })),
}))
vi.mock('@features/compendium', () => ({
  useBackgrounds: vi.fn(() => ({ data: [] })),
}))
```

**Test groups (15 tests target):**

1. **`costToGold` pure function — 3 tests:** 15 gp → 15.0; 50 sp → 5.0; 100 cp → 1.0
2. **`formatCost` pure function — 3 tests:** `{quantity:15, unit:'gp'}` → '15 gp'; zero cost → 'Free'; platinum → '1 pp'
3. **Renders equipment list after load — 2 tests:** Equipment names visible; costs shown
4. **Category filter — 2 tests:** Select 'weapon' → only Longsword shown; 'all' → both shown
5. **Search — 1 test:** Type 'leather' → only Leather Armor shown
6. **Add to selection / gold deduction — 2 tests:**
   - Click "Add" on Longsword → added to selected items; gold decreases by 15
   - Can't afford: gold < cost → button disabled or shows error
7. **Remove from selection — 1 test:** Remove Longsword → gold refunded, item removed from list
8. **Weight limit — 1 test:** Exceeding carry capacity shows warning indicator

---

## What NOT to Test

- CSS class names / styling
- `index.ts` barrel re-exports
- Third-party library internals (react-toastify, zustand internals)
- WebGL shader compilation
- WASM binary loading (test the bridge, not the binary)
- Component structure/markup (no snapshot tests of large trees)
