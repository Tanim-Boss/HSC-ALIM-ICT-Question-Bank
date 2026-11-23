# Design-system implementation guidelines

**Scope.** Handoff rules for a future implementation of the approved Foundations and Core Components. This repository does not yet contain an application, Tailwind configuration, CSS theme, font assets or components. This document creates none of them and does not select a second styling system.

**Source order.** README §§4.5/17 govern locked decisions → [`tokens.json`](tokens.json) mirrors the values for machine use → [design-system.md](design-system.md), [typography.md](typography.md) and [component-architecture.md](component-architecture.md) define usage. When sources disagree, do not silently ship a new value; report the discrepancy and update the authority/mirror together.

## 1. Token consumption

- Treat `tokens.json` as the only machine-readable token map. Its `$value` entries hold the exact palette and design values; `$extensions.ictAtlas.cssVariable` and `tailwindClass` identify intended mappings. The file is DTCG-style JSON with ICT Atlas extensions, not a claim that a token-build package is installed.
- Define Light semantic values at the root and Dark values under the approved `.dark` theme scope. Keep semantic names identical between themes; components must not branch on raw hex values.
- Preserve the existing README primitive variable names: `--canvas`, `--surface`, `--elevated`, `--ink`, `--muted`, `--muted-strong`, `--border`, `--teal`, `--teal-tint`, `--accent`, `--amber` and `--red`. Expose additional semantic aliases only when sourced from the JSON references. Do not manually copy a second palette into component files.
- When mapping CSS variables to Tailwind, use the alpha-aware RGB form (`rgb(var(--token) / <alpha-value>)`) described in README §17.2. This allows utilities to share one theme value. The exact config belongs to the future app setup phase; do not create `tailwind.config.ts` in this documentation-only phase.
- Use semantic classes/roles such as `bg-canvas`, `bg-surface`, `text-ink`, `text-muted-strong`, `border-border`, `bg-teal`, `bg-teal-tint`, plus semantic action/state aliases. Do not use raw hex, arbitrary Tailwind values (`bg-[#...]`) or per-page overrides.
- Typography, spacing, geometry, elevation, breakpoint and motion tokens are consumed from the same JSON map. Every padding, gap and radius should resolve to a named token. Avoid arbitrary values and one-off CSS systems.

## 2. Theme and surface rules

- Light is the learning/reading default. Dark is a fully supported alternate, not a product-wide mandate. An AI Tutor local dark treatment must still use the same semantic variables.
- Switch theme on a shared root, not independently per component. Native controls and scrollbars should use the matching `color-scheme`. Prevent flash of an unintended theme when a preference is later implemented.
- Light and Dark components retain the same sizes, states, focus, typography and behavior. Only semantic token values change. Add a theme-specific rule only for a documented contrast/surface reason. **Do not ship the Dark primary-button foreground as currently specified:** README §17.8's Ink-on-Teal pair fails normal-text AA; the contrast-safe Canvas alternative is not approved.
- Code/terminal content deliberately uses the approved dark code surface and light code text in both themes. Do not derive code colors from the surrounding body text.
- Prefer 1 px borders and tonal layers. Shadows are reserved for popovers, dialogs and dragged items; do not add a default card shadow or glow.
- Never use color alone for status, selection, source, correctness, warning or error. The status meaning remains visible in grayscale and with color-vision differences.

## 3. Typography implementation

- English uses Geist Sans; Bengali uses scoped SolaimanLipi with Noto Sans Bengali fallback; code uses Geist Mono; math uses KaTeX's own stack. Do not apply Bengali fonts globally.
- Use `lang` on the document and on mixed-language runs. Keep Bengali line-height ≥ 1.75, never justify Bengali, test fallback metrics and avoid breaking conjuncts.
- Keep mobile form controls at 16 px text or larger. Use tabular numerals only for aligned data/timers. Do not shrink question text below the token minimum to fit the layout.
- Use semantic heading elements in order. Style tokens do not replace document structure.
- Do not ship font binaries until the SolaimanLipi distribution licence, subset and glyph coverage have been verified (OD-25).

## 4. Component implementation boundaries

- Match the [component contracts](component-architecture.md) and Figma names one-to-one at the public component level. Keep visual component code separate from domain decisions, but do not prescribe physical folders here.
- Prefer semantic HTML. If a custom control is necessary, it must match the required keyboard, focus, labeling, state announcement and mobile behavior before adoption. Optional shadcn/ui primitives remain unselected under OD-31; any future primitive is only a convenience over these tokens.
- Every interactive component supports its applicable default, hover, focus, active, selected, disabled, loading, error and success state from the shared contract. Do not invent meaningless states on static content. Include loading, empty and error states in complete component acceptance.
- Do not make disabled controls a security boundary. The server re-authorizes every protected action. UI components display allowed view models and report intent; they do not authorize, score, reveal answer keys or persist business rules.
- For examinations, server state is authoritative. A local pending answer is not “saved”; answer-save failure/expiry is explicit. Suppress the command palette during an active exam and preserve keyboard-only operation.
- Use one safe structured question renderer across bank, practice, examination, authorized review, tutor context and print. The component contract does not settle the block schema (OD-18) or answer/rubric release (OD-14).

## 5. Interaction and performance quality control

Use the Vercel Web Interface Guidelines reference identified in README §17.16 as a quality-control source for spacing, focus, contrast, input sizing and motion restraint. The review checklist is:

- Visible `:focus-visible` ring, 2 px with 2 px offset; no focus removal; logical keyboard order.
- Text ≥ 4.5:1, qualifying large text and required UI boundaries ≥ 3:1; verify actual foreground/background pairs in both themes.
- Touch targets ≥ 44 × 44 CSS px where interactive; mobile inputs ≥ 16 px.
- Reduced-motion preferences honored; functional durations remain within the token set. No exam timer animation or load-time cascades.
- Dialogs, drawers, popovers and command palette manage focus and return it correctly. Hover never hides an essential action.
- Loading preserves layout; toast/alert announcements use suitable live-region behavior; timer/autosave announcements are polite and not every second.
- Bengali, code, math, long labels, empty/error states and 320 px overflow are inspected—not only English default screenshots.

## 6. Figma-to-code handoff

- Figma variables use the same token and theme names as `tokens.json`. Foundations use Light as default and Dark as alternate.
- Core components are named consistently with this specification, e.g. `Button/Primary/Default`, `Button/Primary/Loading`, `Form/TextInput/Error`, `Feedback/Dialog/Open`, `Question/MCQ/Default`.
- Components use Auto Layout, named variants and explicit min/max constraints; do not bind every component to every theoretical state. Record component behavior and responsive rules in the component spec.
- Handoff includes desktop 1440 × 1000, mobile 390 × 844, tablet and 320 px edge checks, plus Light/Dark and English/Bengali specimens. No product-page frames are included in this work.
- The Figma file itself, React implementation, Tailwind configuration, font assets, dependency choices and browser-test setup are future deliverables and require the applicable approval/gate.

## 7. Verification plan for the later app phase

Before a component is accepted in code, verify:

1. Token parity: no undeclared color/spacing/radius values; Light and Dark use the same semantic class names.
2. Visual states: default, hover, focus, active, selected, disabled, loading, error and success where applicable; empty/loading/error for data-bearing views.
3. Accessibility: labels/descriptions, keyboard behavior, focus order/return, screen-reader state, target size, reduced motion and actual contrast.
4. Responsive: 1440 × 1000, 390 × 844, tablet and 320 px; no normal-content horizontal overflow; mobile alternative exists for desktop actions.
5. Bengali/academic fixture: conjuncts, mixed script, long words, Bengali digits, C/HTML/SQL, KaTeX, diagram alternatives, code scroll/copy and print font availability.
6. Domain/security boundary: no answer keys in student-facing exam projections, no client-authoritative timer or score, no AI-awarded CQ marks, and no permission based on hidden/disabled controls.
7. Regression: automated unit/accessibility and Playwright visual/interaction checks once the test environment is approved (OD-26). Do not claim a browser pass from documentation review alone.

## Related specifications

[Design system](design-system.md) · [Tokens](tokens.json) · [Typography](typography.md) · [Component architecture](component-architecture.md) · [README §17.16](../../README.md#1716-implementation-design-standards)
