# Design system

**Purpose and scope.** Summarize the approved visual and interaction system in the original [README §17](../../README.md) for design handoff. This is documentation only: no Figma work, theme configuration, components or UI implementation is created here. README §17 remains the detailed source for screen specifications.

## Responsibilities and boundaries

The product direction is **Modern Academic SaaS**: restrained, trustworthy, content-first and bilingual. Student reading defaults to a light theme; dark mode is available throughout. The AI Tutor can use an atmospheric dark surface, while examinations remain distraction-free in either theme. Public marketing, student, admin, tutor, learning and examination surfaces share tokens and components but may have different densities. Design communicates states and permissions; the server enforces them.

### Color tokens

| Semantic token | Light | Dark | Intended use |
|---|---|---|---|
| Canvas | `#FAFAFA` | `#090B0D` | Page background |
| Surface | `#FFFFFF` | `#111416` | Panels and inputs |
| Elevated | `#1B2024` | `#1B2024` | Code surface; raised dark surfaces |
| Ink | `#17191B` | `#F2F4F5` | Primary text |
| Muted | `#777D83` | `#8B949C` | Secondary text only when actual contrast and size pass |
| Muted Strong | `#6B7076` | `#8B949C` | Stronger secondary text; verify against the actual surface |
| Border | `#E8EAEC` | `#293137` | Dividers/boundaries |
| Teal / Teal Tint | `#16766B` / `#E7F3EF` | `#55B8A5` / `#203C36` | Primary actions, focus and selection |
| Accent | `#D9E8AE` | `#D9E8AE` | Occasional emphasis; dark ink on this light color |
| Amber / Red | `#B77C2B` / `#B6534C` | `#D9A857` / `#E0877F` | Warning / error and destructive states |

Code blocks use the `#1B2024` code surface with light `#F2F4F5` text in both themes, rather than the light theme's dark default Ink.

Tokens are the styling source, not arbitrary component hex values. Verify actual foreground/background pairs: normal text needs at least 4.5:1 and large text at least 3:1. `Muted #777D83` on white is approximately 4.16:1 and **16 px alone is not WCAG large text**; use an approved stronger token for normal text or a genuinely qualifying large/bold treatment. Non-text UI boundaries also need appropriate contrast. This corrects a conflict between README §17.2 and its WCAG target without changing the palette; see OD-25.

### Geometry, interaction and responsive behavior

| Item | Blueprint specification |
|---|---|
| Spacing | 4 px base; common steps 8, 12, 16, 24, 32, 48 px. |
| Surface | 1 px borders before shadows; cards 10–12 px radius, dialogs 14 px, large sections 16–20 px. |
| Shell | Desktop sidebar 240–256 px (reference 248); top bar 56–64 px (reference 60). Marketing max width 1200 px; app shell 1440 px. |
| Inputs/actions | Inputs 38–42 px high; standard buttons 36–40 px, with touch/icon hit areas at least 44 × 44 CSS px. Mobile input text at least 16 px. |
| Layout | Small mobile 320–374 px; mobile 375–767; tablet 768–1023; laptop 1024–1279; desktop 1280–1535; large desktop 1536+. |
| Motion | Hover 120 ms, press 100 ms, dropdown 150 ms, dialog 180 ms, drawer 200 ms; respect reduced motion. Never animate the exam timer. |
| Focus | Visible `:focus-visible` focus ring, 2 px with 2 px offset; verify contrast. |

On mobile use bottom navigation/drawers and stacked records rather than hiding capabilities; the exam is full-screen. On desktop the shell may offer `Ctrl/⌘ + K`, but suppress the command palette entirely during an active exam. Exam layout has only header, question area and collapsible navigator.

## Accessibility and state requirements

Target WCAG 2.2 AA: keyboard access and logical focus, labelled controls, meaningful image alternatives, text-based state in addition to color, readable math/code, reduced motion and polite timer/autosave announcements without announcing every second. Every important screen needs loading, empty, error and appropriate offline/disabled states. Content must be usable at 320 px, including Bengali compounds and code. Do not claim conformance before testing.

Reference screens and detailed component inventories, design states, Figma pages 00–10 and production order are specified in README §17.5–§17.18. The design-to-code handoff must cover desktop (1440 × 1000 reference), mobile (390 × 844), tablet behavior, both themes and permissions/data requirements.

## Dependencies

The [typography](typography.md) and [component architecture](component-architecture.md) implement the same token and accessibility rules. Question renderer, exam state, analytics source labels and admin permissions depend on their domain contracts. Design foundations and core components precede individual screens; UI/UX implementation must wait for explicit approval.

## OPEN DECISION

[OD-07, OD-14, OD-25 and OD-31](../architecture/technology-decisions.md#open-decision-register) cover language policy, answer-review presentation, font licensing/rendering, contrast application and chart-library/primitives selection. Any approved tools must preserve the locked design system.

## Related documentation

[Typography](typography.md) · [Component architecture](component-architecture.md) · [Original README §17](../../README.md) · [Roadmap](../development/roadmap.md)
