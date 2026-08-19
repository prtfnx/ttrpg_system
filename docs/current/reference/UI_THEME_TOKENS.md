# UI theme tokens

Audience: contributors adding or changing React component styles.

Status: current.

Last source audit: 2026-08-19

## Token ownership

The web client loads the token system through `apps/web-ui/src/index.css` in
this order:

1. `apps/web-ui/src/shared/styles/tokens.css`
2. `apps/web-ui/src/shared/styles/theme.css`

`tokens.css` owns primitive values and scales:

- color palette;
- fluid and compact spacing;
- component sizes and border widths;
- typography, font weights, and line heights;
- radii, shadows, z-index, motion, and blur geometry.

`theme.css` maps those primitives to meaning:

- semantic tokens such as `--bg-primary`, `--text-muted`,
  `--border-focus`, and `--color-danger`;
- interactive tokens such as `--hover-overlay`, `--active-overlay`, and
  `--focus-ring`;
- component tokens such as `--button-primary-bg`, `--input-border`, and
  `--panel-bg`;
- theme and customization overrides selected through document attributes and
  CSS custom properties.

`apps/web-ui/src/features/customization/uiPreferences.ts` is the runtime owner
for those customization hooks. It validates stored preferences, applies
document attributes and custom properties before React mounts, and falls back
to defaults when storage is missing or invalid.

Component CSS should consume semantic or component tokens when the value has
UI meaning. Use primitive geometry tokens such as `--space-*`, `--size-*`,
`--radius-*`, `--text-*`, and `--font-*` when no semantic component token is
needed.

## Component styling rules

- Keep static visual styles in the component or feature CSS module.
- Do not add hardcoded hex, RGB, or HSL colors to component CSS.
- Do not add one-off spacing, font-size, border-width, radius, or font-weight
  literals when the token scale already represents the value.
- Use a globally defined custom property. If a property is intentionally
  optional or injected at runtime, provide an explicit fallback.
- Add a shared token when the same value has a stable meaning across
  components. Do not create a global token only to hide one arbitrary literal.
- Inline React styles are for values that are genuinely computed at runtime,
  such as progress width, canvas position, or a user-selected value. Static
  colors and geometry belong in CSS and still use tokens.

Prefer:

```css
.saveButton {
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--button-primary-border);
  border-radius: var(--radius-md);
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  font-weight: var(--font-semibold);
}

.saveButton:hover:not(:disabled) {
  background: var(--button-primary-hover);
}
```

Avoid:

```css
.saveButton {
  padding: 8px 12px;
  border: 1px solid #2563eb;
  background: #2563eb;
  color: white;
  font-weight: 600;
}
```

## Interactive consistency

`apps/web-ui/src/index.css` supplies the shared `:focus-visible` outline for
buttons, links, form controls, `role="button"`, and focusable elements. It also
supplies the disabled cursor default.

Feature styles should:

- preserve a visible keyboard focus indicator;
- define hover and active states from the matching semantic or component token
  family;
- keep disabled controls visibly and functionally disabled;
- use `aria-pressed`, `aria-selected`, or the matching native state when a
  visual active state represents selection;
- avoid feature-local focus colors that conflict with the shared focus token.

The current preference layer supports dark, light, high-contrast, cyberpunk,
and forest theme mappings; blue, purple, green, red, and orange accent schemes;
sharp, rounded, and pill button geometry; accent opacity; and a custom radius
scale. Components participate by consuming shared tokens rather than checking
the selected preference directly.

Canvas-rendered content is not ordinary component CSS. Keep renderer colors in
the Rust/WASM rendering owner or pass an explicit, documented UI value across
the runtime boundary.

## Add or change a token

1. Search `tokens.css` and `theme.css` for an existing token with the intended
   meaning.
2. Add a primitive to `tokens.css` only when the raw value belongs to a shared
   scale or palette.
3. Add semantic and component mappings to `theme.css`.
4. Use the semantic or component token from feature CSS.
5. Check every theme/customization override that should change the token.
6. Check the foreground/background pair in every supported theme and accent
   combination when the token renders text or control content.
7. Run both CSS checks.

Do not copy token definitions into a feature module. A local custom property is
appropriate only when its meaning is local and it has a local default.

## Verification

Run from `apps/web-ui`:

```powershell
pnpm.cmd run lint:css
pnpm.cmd run validate:css
```

Stylelint enforces the general CSS rules and token-shaped color/property
values. `validate:css` first scans component CSS for hardcoded colors,
actionable pixel/rem geometry, numeric font weights, and undefined
custom-property references. It permits functional values such as media-query
breakpoints and grid constraints where a literal is part of the layout
algorithm.

The same `validate:css` command then runs `validate-theme-contrast.js`. That
validator resolves shared tokens for all 25 supported theme/accent
combinations and requires a contrast ratio of at least 4.5:1 for its declared
text, button, input, and panel-header foreground/background pairs. Add a new
rendered text pair to that validator when introducing a shared component token;
passing the token-reference scan alone does not prove that a color pairing is
accessible.

For line-by-line token violations:

```powershell
pnpm.cmd run validate:css:verbose
```
