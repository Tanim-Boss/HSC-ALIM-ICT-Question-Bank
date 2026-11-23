# ICT Atlas design system

**Scope.** This document specifies Design Production Phase 1 (Foundations) and Phase 2 (Core Components) in written form. It does not design product pages, create Figma frames, implement components, initialize an app, or select a UI-primitives library.

**Decision authority.** `README.md` §§4.5 and 17 remain the authority for locked design decisions. [`tokens.json`](tokens.json) is the machine-readable mirror for handoff; it is not an independent palette or permission to drift from the README. If a value changes, update the authority and its mirror together. This document owns the rationale, semantic use and Figma/implementation rules; [component architecture](component-architecture.md) owns component contracts; [typography](typography.md) owns mixed-script handling.

## 1. Product identity

### Brand foundation

- **Name:** ICT Atlas. Keep the name intact in English interface chrome; localize surrounding navigation as a complete list when localization is enabled.
- **Positioning:** a premium, trustworthy study and examination workspace for HSC / ALIM ICT. It should feel intelligent, precise, academically serious, modern and approachable—not childish or ornamental.
- **Design concept:** **The Atlas Grid**—knowledge made navigable. The draft [`brand-mark.svg`](brand-mark.svg) turns that into an original, flat geometric monogram: an open `A` drawn on a 24 × 24 grid with a centered crossbar and one small upper-right locator node. The 1.75 px paths use `currentColor`; set it to the approved brand Teal for the primary mark, or a contrast-safe monochrome token for one-color use. It must never depend on a gradient, mascot, 3D effect or enclosing rounded app tile.
- **Wordmark:** Geist Sans; `ICT` receives the stronger weight and `Atlas` the same family at regular/medium weight. Keep the mark and wordmark aligned on one optical baseline. In Bengali UI, the product name itself remains the Latin wordmark unless a future localization decision approves otherwise.
- **Brand color:** Teal is a locator/action color, not a screen fill. Use Ink for the wordmark in both themes where contrast permits; use the approved Teal token for the mark's locator detail. Accent is a rare editorial highlight, with dark Ink on Accent.
- **Reference integrity:** Linear, Vercel, Framer, Raycast and DesignCode are influences for interaction discipline, precision, storytelling, focused dark surfaces and editorial learning—not templates to copy. The Atlas Grid is an original product identity.

The SVG is a vector draft for review, not an approved final logo. Use the Foundations page to review optical balance, the locator node at small sizes, wordmark spacing and Light/Dark contrast before approval. In a lockup, pair the mark with live `ICT Atlas` text in Geist Sans rather than converting the wordmark into an uneditable path.

### Five product surfaces, one system

| Surface | Distinct treatment | Shared invariants |
|---|---|---|
| Public website | Framer-inspired storytelling, large editorial type, authentic product material and restrained motion. | Same brand, typography, palette and accessible controls; no marketing page is specified here. |
| Student application | Linear-inspired light-first productivity, keyboard-ready navigation and clear task hierarchy. | Same tokens and component contracts; content outranks chrome. |
| Admin application | Vercel-inspired precision, compact density, aligned tables and quiet borders. | Same tokens; density changes spacing, never meaning or accessibility. |
| AI Tutor | Raycast-inspired focused dark treatment; it may use a local dark surface inside an otherwise light session. | Same semantic tokens, controls and type; no separate color system or purple gradient. |
| Learning content | DesignCode-inspired editorial presentation for long explanations, questions and examples. | Same shared renderer and bilingual type rules; no page-specific question styling. |
| Examination mode | Quiet neutral workspace; the question and answer controls dominate. | Same components in either theme; no command palette, decorative motion or low-contrast timer. |

The default student learning and reading environment is Light. Dark is supported across the system but is not the product-wide default. Examination readability takes precedence over the Raycast influence.

## 2. Color and semantic tokens

The exact light, dark and shared values are defined in README §17.2 and mirrored in [`tokens.json` → `color`](tokens.json). Do not add a new hue, shade, tint, gradient or component-local hex. All components consume semantic tokens through CSS variables/Tailwind mappings.

| Semantic role | Token contract | Use |
|---|---|---|
| Backgrounds | `background.canvas`, `background.surface`, `background.elevated` | Canvas is the page; Surface is ordinary content and form chrome; Elevated is tonal in Dark and the approved dark code surface in both themes. Elevated is not a generic light card fill. |
| Surfaces | `surface.default`, `surface.selected`, `surface.hover`, `background.code` | Separate layers with Surface/Canvas and 1 px borders before adding shadows. Teal Tint marks selection. Code stays on the approved dark code surface in both themes. |
| Text | `text.primary`, `text.secondary`, `text.secondaryStrong`, `text.onPrimary`, `text.onDestructive`, `text.onAccent`, `text.code` | Use Strong Secondary for normal-size secondary copy on light surfaces. Muted is not a general-purpose 14–16 px text color on white. |
| Borders | `border.subtle`, `border.control`, `border.focus`, `border.selected` | Subtle is for passive separators. Use the contrast-safe Control token when an outline is necessary to identify an input/control. Focus and selection use Teal. |
| Primary actions | `action.primary.background`, `action.primary.foreground` | Teal fill with the source-specified foreground. Light is contrast-checked; Dark is blocked pending resolution of the README §17.8 Ink-on-Teal contrast conflict. Use once per decision context; do not make every link or control primary. |
| Secondary actions | `action.secondary`, `action.tertiary`, `action.ghost` | Neutral surface, outline or transparent treatment; hover is subtle. Body links use Ink with an underline and Teal on hover. |
| Selected state | `state.selected` | Teal Tint + Teal + a non-color cue (check, active bar, label or `aria-selected`). |
| Success | `state.success` | Reuses Teal / Teal Tint; include a success label/icon. It is not a new green. |
| Warning | `state.warning` | Reuses Amber. In Light, Amber is limited to icons, badges, qualifying large text and borders; normal-size warning copy uses Ink. |
| Error / destructive | `state.error`, `action.destructive` | Reuses Red; pair with a text label/icon. Destructive actions require confirmation when irreversible. |
| Information | `state.information` | Neutral Ink / Surface / Border, with an information icon and label. No blue information hue is introduced. |

### Contrast guardrails

Palette values do not make every possible pairing accessible. Contrast is checked for the actual foreground, background, size and weight; WCAG 2.2 AA targets are 4.5:1 for normal text and 3:1 for qualifying large text and necessary non-text boundaries.

- Light Muted on white is approximately **4.16:1**. Use Strong Secondary (approximately **4.99:1**) for normal-size text on white. Muted is allowed only where the actual size/weight/background passes; 16 px alone is not “large text.”
- Light Amber on white is approximately **3.54:1**. Keep Amber to icons, badges, borders and qualifying large text; use Ink for ordinary warning copy.
- The subtle Border token is intentionally low contrast. It is suitable for passive separation, not as the only cue identifying a form control. Use `border.control`, a clear surface difference, or both.
- README §17.8 explicitly specifies dark Ink text on dark Teal for primary buttons. That pair is approximately **2.17:1** and fails normal-text AA. The existing dark Canvas token on dark Teal is approximately **8.25:1**, but adopting it would change the locked foreground mapping. The token mirror preserves README's Ink choice and marks the dark primary action **blocked pending owner approval**; do not implement it until the contrast conflict is resolved.
- Status, validity and selection are never communicated by color alone. Gray/monochrome printing must retain status through text, icons, shape and labels.

## 3. Theme architecture

- Light is the default. Dark uses the **same semantic token names** and the same component recipes; only theme variable values change.
- Implementation uses the approved `dark` class strategy: light values at the root, dark overrides on the theme root. Use `color-scheme` consistently for native controls. Persisting a user preference and the system-preference policy are implementation concerns, not a new design decision.
- Components read semantic variables only. No inline hex, arbitrary Tailwind color, opacity-derived color, or one-off page theme. Theme-specific component CSS is permitted only when it consumes the same semantic role.
- AI Tutor may set a local dark surface without changing the global theme. Learning and examination remain readable in Light by default.
- In Light, ordinary raised surfaces use Surface, borders and restrained elevation. The approved Elevated dark surface is reserved for code/terminal blocks or an explicitly specified dark treatment. In Dark, Canvas → Surface → Elevated provides tonal hierarchy; shadows are nearly invisible.

The JSON records primitive hex values and theme-specific semantic aliases. The aliases are intended to map into the CSS-variable names and Tailwind names documented in [implementation guidelines](implementation-guidelines.md); this repository has no app/theme configuration to modify yet.

## 4. Typography, geometry and layout

The complete font stacks and scale live in [`tokens.json` → `typography`](tokens.json) and [typography.md](typography.md). The fixed direction is Geist Sans for English, SolaimanLipi for Bengali with Noto Sans Bengali fallback, Geist Mono for code and KaTeX's stack for math. Display remains 64 px, clamped to 40 px on mobile. Bengali line-height is at least 1.75; do not justify Bengali text.

The geometry token set in [`tokens.json` → `spacing`, `geometry`, `layout` and `breakpoint`](tokens.json) establishes:

- A 4 px base grid and a finite spacing scale; component spacing must resolve to named steps, not arbitrary values.
- One radius family: compact tags/controls, 10–12 px cards, 14 px dialogs and 16–20 px large sections. Do not round every surface into a pill/card.
- 1 px passive borders, 2 px visible focus outline with 2 px offset, 3 px leading active-navigation indicator; borders precede shadows.
- Standard button and field height variants inside the README ranges; interactive hit areas remain at least 44 × 44 px, with mobile inputs at least 16 px text.
- Desktop app shell up to 1440 px, 248 px expanded sidebar / 60 px collapsed rail and 60 px top bar. Public-site max width is 1200 px. Main content padding ranges from 16 px on mobile to 40 px at large desktop.
- A 12-column desktop, 8-column tablet and 4-column mobile grid, with responsive gutters from the same spacing scale. These are layout-grid rules, not a requirement to place every component in a rigid column.
- The six README breakpoint bands from 320 px narrow mobile through 1536 px large desktop; use 1440 × 1000 and 390 × 844 as handoff reference frames.

Shadows are reserved for popovers, dialogs and dragged objects. Cards and app chrome use borders first. Dark elevation is tonal. Motion communicates focus, opening, selection and completion only; respect `prefers-reduced-motion` and never animate the examination timer.

## 5. Responsive behavior

| Range | Shell and content rule |
|---|---|
| 320–374 px | Narrow mobile: 4-column grid; 16 px page padding; 12 px grid gutter; no normal-content horizontal overflow. Test long Bengali words and code. |
| 375–767 px | Mobile: compact top bar, bottom navigation for five primary student destinations, single-column reading/content, full-width primary actions and bottom-sheet filters. |
| 768–1023 px | Tablet: collapsible icon rail and 8-column grid; preserve 2-column information where useful, never squeeze reading text. |
| 1024–1279 px | Laptop: desktop navigation may return as space permits; retain content max-width and sensible density. |
| 1280–1535 px | Desktop: persistent 248 px sidebar, 60 px top bar and 12-column content grid. |
| 1536 px and above | Large desktop: cap the application shell; add outer whitespace rather than stretching reading lines. |

Mobile changes information architecture, not just width. Desktop tables become labeled stacked records on mobile; important actions move to a drawer/menu, not behind hover. Examinations use a full-screen question workspace. Tablet, narrow mobile, keyboard, zoom and safe-area behavior are part of the handoff.

## 6. Figma-ready Foundations and handoff

Use the approved file/page plan from README §17.15. This phase supplies specifications for:

- **00 Cover & Brand Identity:** Atlas Grid construction, wordmark lockup, minimum-size/monochrome notes and approved palette references.
- **01 Foundations:** Color variables with Light/Dark modes; typography styles; 4 px spacing/grid; radii, borders, elevation, breakpoints and responsive shell measurements.
- **02 Components:** Shared components and their variants/states from [component architecture](component-architecture.md).

Use slash naming aligned with the token paths and README conventions, for example `Color/Primary/Teal`, `Typography/Heading/H1`, `Button/Primary/Default`, `Navigation/Sidebar/Active`, and `Question/MCQ/Default`. Use Figma variables for the same semantic names; make Light the default mode and Dark the alternate. Components should use Auto Layout, named properties and explicit focus/disabled/loading/error variants. Do not create Marketing Website, Student Application or other product-screen frames as part of this task.

## 7. Review gate and unresolved decisions

This is a foundations/core-components **proposal for review**, not an assertion that the user has approved it or that Figma/app work exists. The next step is approval or requested revisions; do not begin the Marketing Website or any product screen before explicit approval.

Design work must not silently resolve architecture decisions. In particular, language/toggle policy (OD-07), CQ modality (OD-13), answer/rubric release (OD-14), structured content block schema (OD-18), font licensing and actual shaping/contrast validation (OD-25), the dark primary-action foreground conflict in README §17.8, test setup (OD-26), and optional UI primitives/chart selection (OD-31) remain open. The component contracts identify where those boundaries matter.

## Related specifications

[Machine-readable tokens](tokens.json) · [Typography](typography.md) · [Component architecture](component-architecture.md) · [Implementation guidelines](implementation-guidelines.md) · [README §17](../../README.md#17-uiux-design-system--ict-atlas)
