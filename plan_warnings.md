

# ESLint Audit Report: 935 Problems (8 errors, 927 warnings)

## Verdict: Most warns are NOT ok to just ignore

The previous agent downgraded errors to warns as a band-aid. While some warns are acceptable for gradual migration, **several rules should never have been downgraded** and represent real bug risks.

---

## Classification: Fix vs. Keep as Warn

### **MUST FIX — Dangerous to leave as warn**

| Rule | Count | Why |
|---|---|---|
| `react-hooks/rules-of-hooks` | 31 | **CRITICAL.** React's own team says this must be `"error"`. Conditional hooks cause corrupted state and runtime crashes. You have ~5 genuine violations (try-catch wrapping `useProtocol()`) in production code. |
| Parsing error (auth.mock.ts) | 1 | File can't be parsed at all — unterminated regex literal at line 18. |
| `no-constant-binary-expression` | 1 | Almost always a real logic bug — expression always evaluates the same way. |

### **SHOULD FIX — Real bugs hiding in noise**

| Rule | Count | Why |
|---|---|---|
| `react-hooks/exhaustive-deps` | 52 | ~15 are genuine stale closure risks, especially event listeners registered with stale callbacks (e.g., DragDropImageHandler.tsx). The other ~37 are intentional ref-based patterns (low risk). |
| `@typescript-eslint/no-unused-vars` | 79 | Easy to fix: rename `catch (err)` → `catch (_err)`, prefix `_` on unused params. Upgrade to `"error"` after batch fix. |
| `no-case-declarations` | 15 | Trivial fix: wrap each `case` body in `{ }`. Should be `"error"`. |
| `@typescript-eslint/no-unsafe-function-type` | 4 | Replace `Function` with proper signatures. Quick fix. |

### **ACCEPTABLE AS WARN — Gradual migration**

| Rule | Count | Why |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 721 | Keeping at `"warn"` is standard industry practice for large codebases. Most are at WASM/protocol boundaries where `unknown` + type guards is better, but this is a multi-sprint migration. |
| `react-refresh/only-export-components` | 7 | Affects HMR but not correctness. Fix when touching those files. |
| `no-useless-escape` | 11 | No bug risk, cosmetic. Fix opportunistically. |
| `no-empty` | 4 | Already configured with `allowEmptyCatch`. Low risk. |
| Single-occurrence rules | 4 total | Fix individually when convenient. |

---

## Detailed Fix Plan (Step by Step)

### Phase 0 — Immediate (< 1 hour)

**Step 1: Fix the parsing error in auth.mock.ts**
- Open auth.mock.ts
- Fix the unterminated regex literal at line 18 (likely a JSX fragment `<div>` being parsed as regex)
- File is a `.ts` not `.tsx` — probably needs to be renamed to `.tsx`

**Step 2: Fix `no-constant-binary-expression`**
- Open TypeScriptServices.test.tsx line 187
- Inspect the `||` expression with constant left-hand side — likely needs parentheses or restructuring

**Step 3: Tighten ESLint config for quick-fix rules**
Change in eslint.config.js:
```js
'no-case-declarations': 'error',        // was 'warn'
'no-constant-binary-expression': 'error', // was 'warn'
'@typescript-eslint/no-unsafe-function-type': 'error', // was 'warn'
'@typescript-eslint/no-empty-object-type': 'error',    // was 'warn'  
'@typescript-eslint/no-this-alias': 'error',           // was 'warn'
```

### Phase 1 — `rules-of-hooks` (Priority 1, ~2-4 hours)

**Step 4: Fix the 5 genuine `rules-of-hooks` violations**

The pattern: `useProtocol()` is wrapped in try-catch to handle being outside `ProtocolProvider`. This violates Rules of Hooks.

**Fix strategy — Create an optional protocol hook:**
```tsx
// New: useOptionalProtocol.ts
export function useOptionalProtocol() {
  const ctx = useContext(ProtocolContext);  // Returns null/undefined when outside provider
  return ctx;  // No try-catch needed
}
```

Apply to:
- useWebSocket.ts  
- useAuthenticatedWebSocket.ts
- useChatWebSocket.ts
- wasmBridge.ts
- GameCanvas.tsx

**Step 5: Change `rules-of-hooks` to `"error"`** in eslint.config.js after fixing violations.

### Phase 2 — `no-unused-vars` batch fix (~1 hour)

**Step 6: Batch rename unused catch variables**
```bash
# Pattern: catch (err) → catch (_err), catch (e) → catch (_e), catch (error) → catch (_error)
```
- Touch ~40 files, prefix `_` on all unused catch vars, params, and destructured vars
- Add `destructuredArrayIgnorePattern: "^_"` and `ignoreRestSiblings: true` to the rule config

**Step 7: Remove genuinely unused imports/variables**
- Delete unused imports and variables (like `MockWebClientProtocol`, `roleSelect`, `rerender`, etc.)

**Step 8: Upgrade to `"error"`** after cleanup.

### Phase 3 — `no-case-declarations` fix (~30 min)

**Step 9:** In useTableManagement.ts and other files with switch cases, wrap each case body in `{ }`:
```js
case 'action': {
  const result = doSomething();
  break;
}
```

### Phase 4 — `exhaustive-deps` audit (~3-4 hours)

**Step 10: Audit and fix high-risk exhaustive-deps violations**

Priority targets (event listener stale closures):
1. DragDropImageHandler.tsx — missing `handleAssetUploadResponse` + camera/protocol/sessionId
2. useWebSocket.ts — missing `createMessage`, `sendMessage`, `sprites`
3. useTableSync.ts — missing `options`

**Fix patterns by category:**
- **Stale event listeners** → Add the callback to deps, or use `useRef` for the handler
- **Missing function deps** → Wrap the function in `useCallback`, then add to deps
- **Options object** → Destructure specific properties or `useMemo` the options object

**Step 11: For intentional "run-once" patterns** using refs, add `// eslint-disable-next-line react-hooks/exhaustive-deps` with a justification comment.

### Phase 5 — `no-explicit-any` gradual migration (ongoing, multi-sprint)

**Step 12: Create typed interfaces for the WASM bridge layer**
- Define `WasmBridgeAPI` interface matching the actual WASM exports in wasmManager.ts
- Replace `any` → typed interface at the boundary, `unknown` + type guards for incoming data

**Step 13: Create discriminated union types for WebSocket protocol**
```tsx
type WsMessage = 
  | { type: 'sprite_move'; data: { entityId: number; x: number; y: number } }
  | { type: 'table_sync'; data: TableState }
  | ...
```
Apply to clientProtocol.ts and wasmIntegration.service.ts

**Step 14: Fix `any` in test files**
- Use `as unknown as MockType` pattern instead of `as any`
- Lower priority since tests already have relaxed rules

### Phase 6 — Minor cleanups (opportunistic)

**Step 15:** Fix 11 `no-useless-escape` — remove unnecessary backslashes
**Step 16:** Fix 7 `react-refresh/only-export-components` — split non-component exports into separate files, or add `allowConstantExport: true` to Vite config
**Step 17:** Fix `no-unsafe-function-type` — replace `Function` with typed callbacks in SessionManager.ts

---

## Summary: Recommended ESLint Config Changes

```js
rules: {
  '@typescript-eslint/no-explicit-any': 'warn',          // KEEP warn — gradual 
  '@typescript-eslint/no-unused-vars': ['error', {...}],  // UPGRADE after batch fix
  'react-hooks/exhaustive-deps': 'warn',                  // KEEP warn — React default
  'react-hooks/rules-of-hooks': 'error',                  // UPGRADE — critical safety
  'no-case-declarations': 'error',                         // UPGRADE — trivial fix
  'no-useless-escape': 'warn',                             // KEEP — cosmetic
  '@typescript-eslint/no-unsafe-function-type': 'error',   // UPGRADE — quick fix
  '@typescript-eslint/no-empty-object-type': 'error',      // UPGRADE — 1 occurrence
  '@typescript-eslint/no-this-alias': 'error',             // UPGRADE — 1 occurrence
  '@typescript-eslint/no-unused-expressions': 'warn',      // KEEP — rare
  'no-constant-binary-expression': 'error',                // UPGRADE — bug risk
  'no-empty': ['warn', { allowEmptyCatch: true }],         // KEEP
}
```

