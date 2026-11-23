# Typography and mixed-script rendering

**Scope.** Specify English, Bengali, code and mathematical typography for Foundations/Core Components, plus a repeatable content fixture for later browser/font validation. This is not a font download, redistribution approval, application font setup or claim that rendered shaping has already passed.

**Authority.** README §§4.5 and 17.3 define the locked font families and type scale. The machine-readable values are in [`tokens.json` → `typography`](tokens.json); this document owns application and validation rules. Font licensing and production-suitability remain OD-25.

## Font roles and loading

| Role | Required face | Application rule |
|---|---|---|
| English interface and editorial headings | Geist Sans | One Latin family for UI, body, numerals and display; variable weights per the token scale. |
| Bengali interface | SolaimanLipi | Apply to Bengali language runs using `lang="bn"` or an equivalent scoped class. Never make it the global Latin body face. |
| Bengali fallback | Noto Sans Bengali | Fallback when SolaimanLipi or a glyph is unavailable; verify that the fallback has the expected conjuncts and metrics. |
| Code / technical text | Geist Mono | C, HTML, SQL, pseudocode and inline technical identifiers. Code comments may contain Bengali; test both scripts. |
| Mathematics | KaTeX's own stack | Keep KaTeX metrics independent of Bengali UI fonts. Expose readable fallback text/LaTeX for assistive technology. |

Use the stacks recorded in the token file, self-host/subset only after confirming font coverage and redistribution rights, use `font-display: swap`, and preload only the face/weight actually required above the fold. Do not bundle font binaries until the SolaimanLipi licence is verified. A metric-compatible fallback is preferred to invisible text or layout shift.

## Type hierarchy

The exact machine-readable sizes, weights, line heights and tracking are in `tokens.json#/typography/scale`. The hierarchy follows README §17.3:

- Display is **64 px**, weight 450, line-height 1.1, and clamps to **40 px** on mobile. It is reserved for a future marketing hero, not app chrome.
- H1–H4 use the approved 40 / 28 / 20 / 16 px scale and their approved weights/leading. H5 and H6 are semantic levels mapped to existing 14 px Body and 12 px Small sizes; they do not add new font-size steps and should be rare.
- Body UI copy is 14 px; question content never falls below it. Prefer the tokenized 16 px Reading role for long explanations/questions where layout allows.
- Small, label, button, caption, micro and code roles use the existing 12 / 11 / 13 px scale. Do not shrink reading content to fit a dense layout.
- Display through H3 use restrained negative tracking; Body through Micro keep normal tracking. A compact interface may be dense, but the content column remains readable.

Heading levels must represent document structure, not visual size. Use exactly one H1 and do not skip semantic heading levels.

## Bengali and mixed-script rules

1. Scope fonts by script/language. English remains Geist Sans; Bengali UI/content uses SolaimanLipi then Noto Sans Bengali. Mark language changes with correct `lang` attributes so shaping, pronunciation and fallback are predictable.
2. Use **line-height at least 1.75** for Bengali. Check stacked vowel signs, conjuncts and ascenders/descenders for clipping at every supported weight and fallback face.
3. Never `text-align: justify` Bengali. Use normal word breaking and browser shaping; avoid `word-break: break-all`. Test long compounds at 320 px and use a tested emergency wrap strategy without splitting a conjunct/grapheme.
4. Keep mixed Bengali-English paragraphs in one natural reading flow. Confirm Latin runs retain Geist Sans metrics and code runs use Geist Mono. Do not switch the entire document to a Bengali face because a question contains Bangla.
5. Test Bengali digits and Latin digits separately. Use tabular numerals only in aligned values/timers where supported; never rely on changing numeral style to communicate state. Test Bengali numerals with the selected font and fallback.
6. Keep math in KaTeX. Provide an accessible label/LaTeX fallback; do not alter math layout by applying Bengali font metrics.
7. Test at 200% zoom, keyboard focus, print/PDF font availability, and assistive technology. Code/table overflow may scroll inside a labeled region; normal question text must not create page-level horizontal scroll.

## Repeatable typography fixture

Use the following real-script specimen in the eventual Foundation specimen frame and browser regression fixture. Do not replace it with Latin lorem ipsum.

**Bengali question:**

> বাংলা প্রশ্ন: একটি কম্পিউটার নেটওয়ার্কে তথ্য কীভাবে আদান-প্রদান হয়? ক্ষ, জ্ঞ, ন্ত্র, র্দ্ধ — এই যুক্তাক্ষরগুলো স্পষ্টভাবে পড়া যাচ্ছে কি?

**Mixed Bengali-English paragraph and long words:**

> তথ্য ও যোগাযোগ প্রযুক্তির একটি গুরুত্বপূর্ণ ধারণা হলো computer network-এর topology। একটি তথ্যপ্রযুক্তিভিত্তিক আন্তঃসংযোগব্যবস্থায় router, switch এবং protocol কীভাবে কাজ করে তা ব্যাখ্যা করো। দীর্ঘ শব্দ: প্রযুক্তিনির্ভরতা, আন্তঃসংযোগব্যবস্থা।

**Numerals and subquestion label:**

> বাংলা সংখ্যা: ৬৯ · গাণিতিক চিহ্ন: ১ + ২ + ৩ · উপপ্রশ্ন: (ক)

**C code with a Bengali comment:**

```c
#include <stdio.h>
int main(void) {
  int i = 0; /* মানটি এক ধাপ বাড়াও */
  printf("%d\n", i++);
  return 0;
}
```

**HTML and SQL:**

```html
<h1>তথ্য ও যোগাযোগ প্রযুক্তি</h1>
<p>ICT Atlas — mixed-script rendering.</p>
```

```sql
SELECT student_id, score
FROM exam_results
WHERE chapter_id = 4;
```

**Mathematics:**

> `\frac{a+b}{c} = x^2` and `১ + ২ = ৩`; verify the KaTeX-rendered expression and its spoken/readable fallback.

### Validation matrix

| Check | Viewports / condition | Pass condition |
|---|---|---|
| Bengali conjuncts and matras | 320 px, 390 × 844, tablet, 1440 × 1000; SolaimanLipi and fallback | No clipping, malformed joins, accidental line overlap or glyph loss. |
| Mixed Latin/Bengali paragraph | 320 px and 390 px; font loading and fallback | Correct face per run, natural reading rhythm, no page-level horizontal overflow. |
| Long Bengali compounds | 320 px narrow mobile and 200% zoom | No clipped text or unsafe split inside a conjunct/grapheme. |
| Numbers, punctuation and `(ক)` | Bengali and Latin numerals; normal and tabular figures | Correct glyph coverage and alignment; meaning is not conveyed by style alone. |
| C / HTML / SQL | Narrow mobile, keyboard and copy action | Geist Mono is legible, code region is keyboard-scrollable/copyable, Bengali comments shape correctly. |
| KaTeX | Light and dark themes, keyboard/screen reader | Stable math metrics, sufficient contrast, accessible text/LaTeX fallback. |
| Font swap / print | Slow-font/fallback state and later print/PDF validation | No invisible text; fonts are available before capture; text remains selectable/searchable. |

**Current validation status:** the repository is planning/documentation-only and has no UI, font assets or browser-rendered specimen. This fixture and pass criteria are prepared; actual SolaimanLipi/Noto Sans Bengali shaping, licensing, browser and print checks remain unrun and must not be reported as passed.

## Related specifications

[Design system](design-system.md) · [Machine-readable tokens](tokens.json) · [Component architecture](component-architecture.md) · [Implementation guidelines](implementation-guidelines.md) · [README §§4.5, 17.3](../../README.md#45-typography-and-script-system-v2)
