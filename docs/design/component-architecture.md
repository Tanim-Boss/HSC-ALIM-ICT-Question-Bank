# Component architecture

**Purpose and scope.** Define how the planned design system is composed into reusable presentation components without moving domain logic into the UI. This is a design/engineering boundary document, not a component implementation.

## Responsibilities and boundaries

Components render an authorized view model, present controls and report user intent. Server services validate inputs, enforce permissions, own exam state and calculate results. Components must not decide correctness, derive official scores, hold answer keys or assume that disabled controls provide security.

| Group | Planned reusable elements | Boundary |
|---|---|---|
| Foundations | Semantic tokens, type, spacing, icons, theme | One token system; no ad-hoc colors. |
| Navigation | Sidebar, top bar, breadcrumbs, tabs, command palette, mobile navigation | Keyboard/focus support; suppress palette and general chrome in active exam. |
| Actions and forms | Buttons, inputs, select, checkbox, radio, file upload, rich editor | Labels, help/errors, disabled/loading states; client validation is supplemental. |
| Question content | MCQ/CQ, metadata, paragraph, list, image/diagram, table, code, math, subquestion | Shared typed renderer; only approved content blocks and authorized data. |
| Examination | Timer, answer controls, autosave indicator, navigator, submit confirmation | Timer reflects server time; answer saving and finalization are server-authoritative. |
| Learning | Metrics, progress, charts, topic/chapter rows, tutor messages | Source-labelled results; do not blend self-assessment into MCQ accuracy. |
| Documents | Paper page/outline, properties, preview, export panel | Document model is edited; same safe content renderer and print styling, not PDF manipulation. |
| Admin | Data table, filters, status, bulk actions, review controls | Do not expose actions as authorization; each server operation rechecks rights. |
| Feedback | Alert, dialog, toast, skeleton, empty/error/offline states | Text + icon/state, not color alone; accessible announcements. |

### Shared question renderer

The same structured content vocabulary serves the bank, exam, tutor context, review and paper/print output. Semantic formatting and safe block behavior should be consistent, but **data visibility is surface-specific**: a shared renderer never receives a privileged answer key just because a different surface can display it. Use text alternatives for diagrams, readable math fallback and keyboard-scrollable/copyable code. Unknown or unsafe block types must not execute. Exact block schema and content migrations remain OD-18.

### State and accessibility contract

Components have relevant default, hover, focus, pressed, disabled, loading, error and empty states. Buttons reserve loading space; forms associate labels and error text; dialogs/palette manage focus; all important actions have a mobile equivalent. Exam navigator states (neutral, answered, current, review, error) include labels. Preserve visible save/offline status and focus without pretending a local answer is server-saved.

Match Figma and component naming conceptually, e.g. `Button/Primary/Default`, `Question/MCQ/Default` and `Examination/Timer/Warning`. This naming is a handoff convention, not evidence that code or Figma components exist.

## Dependencies

Components depend on [design tokens](design-system.md), [typography](typography.md), authorized [API projections](../api/api-contracts.md), the [question-bank model](../modules/question-bank.md), and examination/analytics state. Server-only services and provider adapters are outside the presentation layer.

## OPEN DECISION

[OD-07, OD-13–OD-14, OD-17–OD-18, OD-25–OD-26 and OD-31](../architecture/technology-decisions.md#open-decision-register) cover localization, CQ interaction, content release, contract/block shape, typography, component testing and unselected chart/UI primitives. Any adoption must preserve the approved tokens and accessibility goals.

## Related documentation

[Design system](design-system.md) · [Typography](typography.md) · [Examination Engine](../modules/examination-engine.md) · [Coding standards](../development/coding-standards.md)
