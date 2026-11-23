# Typography and mixed-script rendering

**Purpose and scope.** Record the approved English, Bengali, code and math typography and the tests needed for web and print. This document does not download, license, subset or install fonts.

## Responsibilities and boundaries

| Use | Blueprint face | Rule |
|---|---|---|
| English UI, body and headings | Geist Sans | Variable weights 400–600; display headings use 450/550 as specified. |
| Bengali UI and optional print fidelity | SolaimanLipi | Scope using `lang="bn"` or an equivalent language-specific class; verify redistribution licence. |
| Bengali fallback | Noto Sans Bengali | Use if the primary face or a glyph is unavailable. |
| Code | Geist Mono | C, HTML, SQL, pseudocode and inline technical content. |
| Math | KaTeX's own font stack | Provide accessible reading/fallback text; do not use a Bengali UI face as the math font. |

Do not apply the Bengali face as the global Latin body font. Mixed-script text must retain correct shaping; never justify Bengali. Use Bengali line-height at least 1.75, avoid clipped matras and ensure the display remains usable at 320 px. Self-host/subset and use an appropriate swap/fallback strategy as planned; preload only what is needed above the fold. Confirm real font metrics, font coverage and licensing before shipping binaries.

## Type scale

| Token | Size | Weight | Line height / use |
|---|---:|---:|---|
| Display | 64 px, clamped to 40 px on mobile | 450 | 1.1; marketing hero |
| H1 | 40 px | 550 | 1.2 |
| H2 | 28 px | 550 | 1.25 |
| H3 | 20 px | 550 | 1.35 |
| H4 | 16 px | 600 | 1.4 |
| Body | 14 px | 400 | 1.5 Latin / at least 1.75 Bengali |
| Small | 12 px | 400 | 1.5 |
| Micro | 11 px | 500 | 1.4 |
| Code | 13 px | 400 | 1.6 |

The README also calls for generous reading surfaces (16 px or more where practical) and mobile form inputs at least 16 px; 14 px is the minimum question text, not a reason to shrink long-form reading. Display through H3 use tight tracking; smaller text uses normal tracking. Apply actual contrast thresholds based on rendered size and weight; 16 px text is not automatically WCAG large text.

## Verification

- Render real conjuncts and mixed content: `ক্ষ`, `জ্ঞ`, `ন্ত্র`, `র্দ্ধ`, `৬৯`, `১+২+৩`, `(ক)`, `i++` and Bangla/English paragraphs.
- Check 320 px mobile, tablet and desktop, including fallback fonts, code, tables, zoom and screen readers. Prevent horizontal overflow except intentional accessible code/table scrolling.
- For browser print and server PDF snapshots, make font resources reliably available, wait for them before snapshotting, check conjuncts and line/page breaks, and verify text is selectable/searchable rather than rasterized.
- Validate actual foreground/background combinations in both themes and on paper. README's light `Muted` example does not meet normal-text contrast on white; use an approved compliant token/pair.

## Dependencies

The [design system](design-system.md) owns tokens and WCAG targets; the [shared renderer](component-architecture.md) and [Paper Studio](../modules/paper-studio.md) depend on consistent shaping across screen and print. Font delivery and caching depend on deployment/network constraints.

## OPEN DECISION

[OD-07, OD-25 and OD-28](../architecture/technology-decisions.md#open-decision-register) cover language preference, font licence/production suitability, contrast application and export details. Do not assume a licence or claim shaping quality before verification.

## Related documentation

[Design system](design-system.md) · [Components](component-architecture.md) · [Paper Studio](../modules/paper-studio.md) · [Testing strategy](../development/testing-strategy.md) · [Original README §§4.5, 17.3](../../README.md)
