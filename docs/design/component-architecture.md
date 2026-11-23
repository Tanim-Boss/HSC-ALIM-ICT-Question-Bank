# Core component architecture

**Scope.** This is the reusable component specification for Design Production Phase 2. It adds no product-page layouts or application code. Components are presentation primitives over authorized view models; server/domain services own validation, permissions, examination state, answer keys and official scoring.

**Authority.** Visual values come from [`design-system.md`](design-system.md), [`tokens.json`](tokens.json) and README §17. This document owns the inventory, relevant states, variants, interaction and surface behavior. Physical React folders, selected headless primitives and app architecture remain out of scope.

## 1. Shared component contract

Every component uses the same theme variables, typography, spacing, focus and state semantics. Use a semantic HTML element first. Components must not make authorization or correctness decisions, derive official scores, retain answer keys, or treat a disabled control as security.

### State notation

The inventory uses these state codes to keep variants explicit without creating a Cartesian product of irrelevant states:

| Code | State | Contract |
|---|---|---|
| D | Default | Resting/available state. |
| H | Hover | Pointer-only enhancement; never the only indication of interactivity. |
| F | Focus | Visible keyboard `:focus-visible` outline (2 px, 2 px offset, semantic Focus token). Focus is not removed when a control is selected. |
| A | Active | Pressed, open, expanded or in-progress interaction. |
| S | Selected | Current/checked/chosen state, also represented semantically (`aria-selected`, `aria-pressed`, `checked`, `aria-current`, text or icon). |
| X | Disabled | Cannot activate; label and reason remain perceivable. Do not rely only on reduced opacity. |
| L | Loading | Pending state with stable geometry; announce meaningful progress and prevent duplicate submission where appropriate. |
| E | Error | Error state is associated with the control/content, announced appropriately and explained in text. Never color alone. |
| OK | Success | Valid/completed/saved state where meaningful, with text/icon. Do not show correctness feedback in an active exam. |

`—` means that state does not apply to the component itself. Static components do not acquire fake hover/focus behavior; their embedded actions use the action contract. Component-level success/error/loading should be explicit, not inferred from a color change.

### Shared size references

The exact reusable dimensions are tokenized in [`tokens.json` → `geometry`](tokens.json):

- Buttons: Small / Medium / Large = 36 / 38 / 40 px visual height. Fields: 38 / 40 / 42 px. Hit area is at least 44 × 44 px; mobile controls use at least a 44 px target and inputs use at least 16 px text.
- Icon buttons have a 44 × 44 px hit area even when the visible icon is smaller. Button loading reserves its spinner slot so label width does not jump.
- Dialogs have Small / Medium / Large max-width tokens; on mobile they become a safe-width full-screen or near-full-width dialog. Drawers are full-width/bottom-sheet on mobile and bounded panels on larger viewports.
- Avatar: Small / Medium / Large = 24 / 32 / 40 px. Cards use compact/comfortable content density, not unrelated visual skins.
- Components not listed above inherit content size; do not add a size variant merely to fill a Figma property menu.

## 2. Inventory, variants and state coverage

`D/H/F/A/S/X/L/E/OK` refer to the contract above. For grouped variants the listed state set applies to each applicable interactive item. Action outcome states are usually expressed by an Alert/Toast or field message, not by permanently mutating the trigger button.

### A. Actions

| Component | Variants / size | Relevant states | Behavior |
|---|---|---|---|
| Primary Button | Primary action; Small / Medium / Large | D/H/F/A/X/L; E/OK via result feedback | One primary action per decision context. Teal is restrained; loading preserves width. |
| Secondary Button | Supporting outlined/surface action; Small / Medium / Large | D/H/F/A/X/L; E/OK via result feedback | Neutral emphasis; no competing primary fill. |
| Tertiary Button | Low-priority text action; Small / Medium / Large | D/H/F/A/X/L | Keep label visible and hit area practical; do not style every link as a button. |
| Ghost Button | Minimal chrome / toolbar action; Small / Medium / Large | D/H/F/A/X/L | Transparent resting state; hover uses subtle theme surface. |
| Destructive Button | Destructive action; S / M / L | D/H/F/A/X/L; E/OK via result feedback | Red is reserved for destructive/error meaning; irreversible action uses Confirmation Dialog. |
| Icon Button | Utility or icon-only button; same size family, 44 px minimum hit area | D/H/F/A/S/X/L; E/OK via result feedback | Requires an accessible name; toggles expose pressed/selected state; tooltip supplements, never replaces, the name. |
| Button Group | Related actions; horizontal or vertical, inherited size | D/H/F/A/S/X; L per action | Use a toolbar/segmented semantic only when actions are genuinely related. Exactly one selected item only for a single-choice group. |

### B. Form elements

| Component | Variants / size | Relevant states | Behavior |
|---|---|---|---|
| Text Input | Small / Medium / Large; optional leading/trailing affordance | D/H/F/A/X/L/E/OK | Programmatic label, optional helper, required indicator and linked validation. Focus may coexist with filled/value state. |
| Search Input | Compact or standard field; clear action is a separate Icon Button | D/H/F/A/X/L/E; S for suggestions; OK on results region | Search updates are debounced only when needed; announce result count/no-results, not every keystroke. |
| Textarea | Small / Medium / Large width/layout is content-driven; height grows or scrolls intentionally | D/H/F/A/X/E/OK | Preserve line breaks; show a character count only when there is a real limit. Mobile text is at least 16 px. |
| Select | Single value; native-compatible or custom with equivalent keyboard/AT behavior | D/H/F/A/S/X/L/E/OK | Closed/open/selected states; type-ahead and predictable dismissal. Do not build custom behavior without parity. |
| Multi-select | Searchable or simple depending on option count; removable selected values | D/H/F/A/S/X/L/E/OK | Selected values are visible chips/tokens with individual named remove actions. Backspace removes the last focused/appropriate value, never silently loses the whole field. |
| Checkbox | Checked / unchecked / indeterminate only when parent-child data supports it | D/H/F/A/S/X/E/OK | Label and hit area are clickable; group label and group errors are programmatically associated. |
| Radio | Single-choice group | D/H/F/A/S/X/E/OK | One selected value; arrow-key behavior within a labeled group; do not use for multi-select. |
| Switch | On / off with explicit label and setting outcome | D/H/F/A/S/X/E/OK | Use only for an immediate binary setting, not a multi-option decision. State is exposed as checked/pressed. |
| Date Picker | Date field plus calendar popover | D/H/F/A/S/X/L/E/OK | Keyboard-operable grid; current, selected, unavailable and today states have text/semantic cues. Do not require dragging. |
| Form Label | Required/optional label; associated control | D; reflects X/E/OK of its field | Use a real `<label>` or equivalent programmatic association. Do not use placeholder text as the only label. |
| Helper Text | Neutral assistance associated with one field/group | D; reflects X | Stable placement; link via `aria-describedby`; do not use color as the only difference from validation. |
| Validation Message | Error or success message associated with a field/group | E/OK; L only for async validation status | Error explains how to recover; focus/announcement moves only when needed. Preserve the message until corrected or dismissed by a documented rule. |

### C. Navigation

| Component | Variants / size | Relevant states | Behavior |
|---|---|---|---|
| Application Header | Desktop / compact mobile; shared controls (brand, breadcrumb, search, help, profile) | D; embedded actions use D/H/F/A/S/X/L | Does not duplicate the sidebar list. Keep brand and account controls stable while content changes. |
| Sidebar | Expanded / collapsed rail / mobile drawer | D/H/F/A/S/X/L | Persistent on desktop, icon rail on tablet, drawer or replaced by bottom nav on mobile. Focus order is logical; collapsed items retain accessible names and tooltips. |
| Sidebar Navigation Item | Default / active / nested where required | D/H/F/A/S/X/L | Active item uses Teal Tint, Teal text, a 3 px leading bar and `aria-current`; no color-only current state. |
| Breadcrumb | Full / truncated with accessible overflow | D/H/F/S | Links are keyboard-operable; final current location is plain text or `aria-current="page"`, not a duplicate link. |
| Tabs | Horizontal / scrollable on narrow screens | D/H/F/A/S/X/L; E on a panel | Use tablist semantics, arrow-key movement and roving tab index; make panel relationship and current tab explicit. |
| Pagination | Numbered / previous-next / compact | D/H/F/A/S/X/L | Current page is explicit; unavailable previous/next controls are disabled, not silently removed. Announce changed result range when useful. |
| Mobile Navigation | Bottom navigation / account menu / drawer | D/H/F/A/S/X/L | Five primary student destinations as approved in README; secondary destinations remain reachable. Respect safe area and label the current destination. |
| Command Palette | Search, grouped results, recent items, empty/no-results state | D/F/A/S/X/L/E; H for pointer results | `Ctrl+K` / `⌘+K`; arrow keys move, Enter selects, Esc closes and restores focus. Do not open while typing in an input/editor or anywhere in an active examination. |

### D. Data display

| Component | Variants / size | Relevant states | Behavior |
|---|---|---|---|
| Card | Standard 10–12 px radius; compact / comfortable density; static or actionable | Static: D/L/E/OK; actionable: D/H/F/A/S/X/L | Static card is not a button. Actionable card has one clear accessible target and uses the same focus/disabled contract as an action. Borders before shadows. |
| Stat | Value, label, optional comparison/source | D/L/E/OK | Include units and timeframe; never imply that self-assessed and automatically scored results are the same metric. Do not encode trend with color alone. |
| Badge | Neutral, source, status or count; compact / regular | D; H/F/A/S/X only when it is an actual control | Text/icon carries the meaning. AI-generated, official board, model and institution sources remain visibly distinguishable. |
| Status Indicator | Dot/icon plus visible label | D/L/E/OK (including warning state) | No dot-only state; include label and useful accessible name. Use semantic role appropriate to urgency. |
| Avatar | Small / Medium / Large; image, initials or neutral fallback | Static: D/L; actionable: D/H/F/A/X | Decorative avatar uses empty alt; identity-bearing avatar has useful alt. Do not expose sensitive student identifiers unnecessarily. |
| Tooltip | Short supplemental text; trigger-owned placement | D/H/F/A(open) | Appears on hover and keyboard focus; dismissible by Esc where appropriate. Never contains the only label or essential instruction. |
| Table | Compact / comfortable row density; sortable/filterable columns only when needed | D/H/F/A/S/X/L/E; OK for completed operation | Semantic headers, caption/label, sort state, row/action focus and selectable-row semantics. Mobile becomes stacked labeled records; preserve all critical fields. |
| Empty State | Contextual icon, concise explanation and optional recovery action | D; action uses shared button states | Explain what is empty and how to proceed. Avoid decorative illustration or generic AI-dashboard language. |
| Skeleton | Shape aligned to the final content layout | L | Mark loading region once, keep layout stable, hide purely decorative skeleton pieces from AT, and respect reduced motion. |
| Progress Indicator | Determinate or indeterminate; linear or circular only when meaningful | D/L/OK/E | Expose value/min/max or indeterminate status. Pair progress with a label; do not invent precision or animate a timer. |

### E. Feedback and overlays

| Component | Variants / size | Relevant states | Behavior |
|---|---|---|---|
| Dialog | Small / Medium / Large; modal | D(closed)/F/A(open)/X/L/E/OK | On open, move focus inside; contain focus; Esc closes when safe; restore focus to trigger. Use a visible title and description. |
| Confirmation Dialog | Neutral or destructive confirmation; same size family | D/F/A/X/L/E/OK | State the consequence in plain language. Default focus should not accidentally confirm a destructive action. Cancel is always available unless the operation is truly blocking and explained. |
| Drawer | Side panel or mobile bottom sheet | D/F/A/X/L/E/OK | Focus management matches Dialog when modal; preserve dismiss affordance and safe-area padding. Filters are reversible and mobile-accessible. |
| Toast | Success / error / warning / neutral info; optional action | D/H/F/A(dismiss/action); E/OK are message types | Announce with suitable live-region politeness; pause timeout on hover/focus. Do not auto-dismiss critical errors or use Toast as the only record of an important state. |
| Alert | Inline or banner; success / warning / error / information | D/E/OK; H/F/A only for contained actions/dismiss | Persistent enough to read; use role and urgency appropriate to content. Include text and icon; neutral information uses no invented hue. |
| Dropdown Menu | Menu button, grouped items, separators only when helpful | D/H/F/A/S/X/L | Trigger exposes expanded state; arrow keys navigate, Enter/Space activates, Esc closes and returns focus. Menu items are not nested buttons. |
| Popover | Non-modal contextual panel; anchored to trigger | D/H/F/A/X; L/E in content | Use for supplemental actions/content, not a replacement for a dialog when a decision blocks the user. Define outside-click/Esc behavior and focus return. |
| Loading State | Inline, region or full-workspace status using Skeleton/Progress | L | State what is loading when duration/context matters. Avoid an endless spinner with no message; never claim a save is complete before server confirmation. |
| Error State | Inline, region or recoverable workspace state | E; retry action: D/H/F/A/L/OK | Say what failed and the safe next step; avoid exposing server internals or sensitive data. Retry is an action and reflects its own loading/success. |

### F. Academic and question-content components

| Component | Variants / size | Relevant states | Behavior |
|---|---|---|---|
| MCQ Question Container | Shared content renderer; metadata optional by surface | D/L/E; answer state belongs to Answer Option | Presents structured question content consistently in bank, practice, examination, review and print. Container does not calculate correctness. |
| CQ Question Container | Shared content renderer; nested subquestions/marks when authorized | D/L/E; any input state is defined only after modality approval | Display the structured question and subparts. Do not assume typed vs paper response (OD-13); do not invent a CQ answer editor in this phase. |
| Question Metadata | Type, chapter/topic, board/year/source and revision fields as available | D/L/E | Read-only by default; show only fields present in the authorized view model. Do not invent provenance fields or imply missing source data. |
| Question Source Badge | Official board, model, institution or AI-generated source label | D; interactive only if linked | Persistent text label plus restrained token treatment. Source and revision are visible; AI-generated material is never presented as verified. |
| Chapter / Topic Tag | Chapter or topic; static or filter/navigation link | Static: D; interactive: D/H/F/A/S/X | Maintain a consistent taxonomy label. Filter selection is explicit and reversible; no decorative tag clouds. |
| Answer Option | MCQ option; text, code, image or mixed content | D/H/F/A/S/X/L/E; OK only in an authorized review surface | Selected means “chosen,” not “correct.” Distinguish save failure from an incorrect answer. Correctness feedback must never be inferred or shown during an active exam. |
| Explanation Panel | Collapsed/expanded content; source/verification label when relevant | D/F/A/S/L/E/OK | Reveal only when the view model is authorized. Explain concepts, not hidden answer keys; expansion and streaming must not shift existing content unnecessarily. |
| Code Block | C / HTML / SQL / pseudocode; dark code surface in both themes | D/F/L/E; copy action adds H/F/A/OK/E | Geist Mono, language label, readable line wrapping or keyboard scrolling, and copy control with an announced result. Syntax color is not the sole meaning. |
| Mathematical Expression | Inline or display KaTeX | D/L/E | KaTeX fonts and metrics, sufficient contrast, accessible textual/LaTeX fallback. It is not an editable field unless a separate approved interaction requires one. |
| Image / Diagram Container | Responsive image; diagram, flowchart or zoomable media | D/L/E; F/A/S for a zoom/action control | Preserve aspect ratio, provide meaningful alt/long description, and offer keyboard-operable zoom when useful. Do not make labels available only inside a raster image. |

A single safe, typed question renderer remains the target across destinations, but the exact structured-content schema and sanitization rules remain OD-18. A shared renderer never receives privileged answer-key data merely because another surface could display it.

## 3. Interaction and keyboard contract

- **Global focus:** visible 2 px outline with 2 px offset; never remove focus styling. Match DOM order to visual order. When focus is moved programmatically, explain why and restore it after modal dismissal.
- **Buttons:** native button semantics, Enter/Space activation, meaningful label, `type` set intentionally; no nested interactive content. Loading blocks duplicate action as appropriate and keeps width stable.
- **Forms:** Tab order follows reading order; labels are programmatic; instructions and errors are linked with `aria-describedby`. Enter behavior is predictable. Validation does not depend on blur alone or color alone.
- **Selection groups:** radio/tab/menu/command result groups use the expected arrow-key/roving-focus model. Checkbox and switch state is announced. Avoid trapping arrow keys inside ordinary text inputs.
- **Date picker:** keyboard moves by day/week and month/year through documented controls; Enter/Space selects; Esc returns to the trigger. Current date, selected date and unavailable dates are distinguishable without color.
- **Dialogs/drawers:** focus is managed, Escape behavior is safe, close control has an accessible name, and background content is not operable when modal. Confirmation copy precedes destructive commit.
- **Tooltip/popover:** tooltip works on focus as well as hover; popovers have a clear non-modal or modal keyboard model. Hover is never required for essential functionality.
- **Command palette:** `Ctrl/⌘+K`, type to filter, Up/Down to move, Enter to act, Esc to close and restore focus. Suppress it during active examinations and while editing text.
- **Academic content:** diagrams have alternatives; code is keyboard-scrollable and copyable; math has accessible text. Examination answer controls remain operable without a mouse. Timer/autosave announcements are polite and not emitted every second.

## 4. Responsive behavior

- **Desktop (1440 × 1000 reference):** expanded 248 px sidebar, 60 px top bar; tables retain labeled columns; contextual content stays within the 12-column layout.
- **Tablet (768–1023 px):** sidebar collapses to an icon rail; controls keep hit targets; panels reflow without sacrificing question width.
- **Mobile (390 × 844 reference):** compact top bar and bottom navigation; drawers become bottom sheets; primary actions are full-width where appropriate; table records become stacked, labeled blocks; dialog/drawer content respects safe areas.
- **Narrow mobile (320–374 px):** four-column grid with narrower gutter; no page-level horizontal scroll. Long Bengali compounds, math, tables and code receive explicit overflow treatment; only code/table regions may scroll horizontally when necessary.
- **All sizes:** no important desktop capability is removed without a mobile equivalent. No hover-only actions. Inputs use at least 16 px text on mobile to prevent browser auto-zoom.

## 5. Figma and implementation handoff

- Figma component names follow the token/component language: `Button/Primary/Default`, `Button/Primary/Loading`, `Form/TextInput/Error`, `Navigation/Sidebar/Active`, `Feedback/Dialog/Open`, `Question/MCQ/Default`, `Academic/AnswerOption/Selected`.
- Use component properties for a small, intentional set such as `variant`, `size`, `state`, `theme` and `locale`; create only meaningful combinations. Do not generate every theoretical state combination for static components.
- Use Auto Layout, 4 px spacing tokens, semantic color variables and explicit content constraints. Provide Light default / Dark alternate and English / Bengali specimens for the foundations/components only.
- Include focus, disabled, loading, error, success, empty and representative content variants where relevant. A screenshot of only the default state is not a handoff.
- Code implementations later use the exact shared token layer, semantic HTML, accessible names, labels, descriptions and controlled state. The selected component library, code folder layout and page architecture are not chosen here.

## 6. Domain boundaries and unresolved decisions

- UI components present authorized data and report user intent. The server validates, authorizes, owns exam time/save/finalization, evaluates results and enforces role permissions.
- Never expose official answer keys through student-facing examination APIs; no UI state or post-finalization shortcut overrides that boundary. OD-14 controls any later answer/rubric release.
- Exam state labels must distinguish unsaved, saving, saved, save failed, expired and submitted. Never present local state as server-confirmed.
- Preserve separate provenance for automatic MCQ evaluation and self-assessed/teacher-reviewed CQ values. Do not ask AI to award or propose CQ marks.
- OD-07 language policy, OD-13 CQ input/result model, OD-14 answer release, OD-16 authorization matrix, OD-18 content schema, OD-19 asset rules, OD-25 font/contrast validation, OD-26 test setup and OD-31 optional primitives remain unresolved; component specs do not settle them.

## Related specifications

[Design system](design-system.md) · [Typography](typography.md) · [Machine-readable tokens](tokens.json) · [Implementation guidelines](implementation-guidelines.md) · [System architecture](../architecture/system-architecture.md) · [README §§17.8–17.12](../../README.md#178-component-system)
