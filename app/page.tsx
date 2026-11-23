import { BrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * TEMPORARY DEVELOPMENT SPECIMEN — not a product screen.
 *
 * This page exists to prove the Phase 03 application foundation:
 *   fonts (Geist Sans / Geist Mono via next/font, SolaimanLipi stack for Bengali),
 *   light/dark themes (semantic tokens only), responsive grid foundation,
 *   bilingual (English/Bengali) and mixed-script rendering.
 *
 * Do not extend this into a marketing site, student dashboard or admin
 * dashboard. Product screens require their approved design phase.
 */

const colorSwatches = [
  { name: 'Canvas', utility: 'bg-canvas', role: 'Page background' },
  { name: 'Surface', utility: 'bg-surface', role: 'Cards, panels, forms' },
  { name: 'Elevated', utility: 'bg-elevated', role: 'Code/terminal surface (both themes)' },
  { name: 'Ink', utility: 'bg-ink', role: 'Primary text & headings' },
  { name: 'Muted', utility: 'bg-muted', role: 'Metadata ≥ 16px only' },
  { name: 'Muted Strong', utility: 'bg-muted-strong', role: 'Body-size secondary text' },
  { name: 'Border', utility: 'bg-border', role: '1 px hairline separators' },
  { name: 'Teal', utility: 'bg-teal', role: 'Brand, primary action (light), focus' },
  { name: 'Teal Tint', utility: 'bg-teal-tint', role: 'Selected backgrounds' },
  { name: 'Accent', utility: 'bg-accent', role: 'Rare emphasis; Ink on Accent' },
  { name: 'Amber', utility: 'bg-amber', role: 'Warnings — icons/badges/large text' },
  { name: 'Red', utility: 'bg-red', role: 'Errors & destructive actions' },
] as const;

export default function DevelopmentSpecimenPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Application shell foundation — top bar */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-app-shell items-center justify-between gap-4 px-4 sm:h-topbar sm:px-6 xl:px-8 2xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            {/* Brand mark: approved paths from docs/design/brand-mark.svg, inlined so currentColor adapts to the theme */}
            <BrandMark className="h-6 w-6 shrink-0 text-ink" />
            <p className="truncate text-button font-heading tracking-tight">
              <span className="font-strong">ICT</span> Atlas
            </p>
            <span className="hidden rounded-micro border border-border bg-canvas px-2 py-1 text-micro uppercase tracking-wide text-muted-strong sm:inline-block">
              Dev specimen
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-app-shell px-4 py-8 sm:px-6 md:py-10 xl:px-8 2xl:px-10">
        {/* Page title — the only H1 on this page */}
        <div className="max-w-3xl">
          <p className="text-label uppercase tracking-wide text-muted-strong">
            Phase 03 · Application foundation
          </p>
          <h1 className="mt-2 text-h1">
            ICT Atlas <span className="text-muted-strong">— ভিত্তি</span>
          </h1>
          <p lang="bn" className="mt-3 text-reading text-muted-strong">
            তথ্য ও যোগাযোগ প্রযুক্তি — প্রশ্ন ব্যাংক ও অনলাইন পরীক্ষা প্ল্যাটফর্ম। এটি একটি অস্থায়ী ডেভেলপমেন্ট স্পেসিমেন, কোনো প্রোডাক্ট স্ক্রিন নয়।
          </p>
          <p className="mt-2 text-body text-muted-strong">
            ICT Atlas is a question bank and online examination platform for HSC / Alim ICT. This is a
            temporary development specimen verifying the foundation — not a product screen.
          </p>
        </div>

        {/* Color tokens */}
        <section aria-labelledby="colors-heading" className="mt-10">
          <h2 id="colors-heading" className="text-h3">
            Color tokens <span className="text-muted-strong">/ রঙ টোকেন</span>
          </h2>
          <p className="mt-1 text-small text-muted-strong">
            Semantic tokens from README §17.2, mirrored by docs/design/tokens.json. Both themes share the
            same names; only values change. No hex values appear in components.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {colorSwatches.map((swatch) => (
              <li
                key={swatch.utility}
                className="overflow-hidden rounded-card border border-border bg-surface"
              >
                <div aria-hidden="true" className={`h-16 w-full ${swatch.utility}`} />
                <div className="p-2">
                  <p className="text-label text-ink">{swatch.name}</p>
                  <p className="mt-0.5 text-micro leading-snug text-muted-strong">{swatch.role}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Typography */}
        <section aria-labelledby="type-heading" className="mt-10">
          <h2 id="type-heading" className="text-h3">
            Typography <span className="text-muted-strong">/ টাইপোগ্রাফি</span>
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-card border border-border bg-surface p-5">
              <h3 className="text-h4">Geist Sans — English UI</h3>
              <p className="mt-3 text-h2">Display heading 28</p>
              <p className="mt-2 text-h3">Card heading 20</p>
              <p className="mt-2 text-body">
                Body — 14 px, line-height 1.5. Question text never drops below this size. Tabular
                figures for aligned values: 0123456789.
              </p>
              <p className="mt-2 text-caption text-muted-strong">
                Caption — 12 px helper text and metadata.
              </p>
              <p className="mt-2 text-micro uppercase tracking-wide text-muted-strong">
                Micro — badges &amp; source lines
              </p>
            </div>

            <div className="rounded-card border border-border bg-surface p-5">
              <h3 className="text-h4">SolaimanLipi → Noto Sans Bengali — বাংলা</h3>
              <div lang="bn" className="mt-3">
                <p className="text-reading">
                  বাংলা প্রশ্ন: একটি কম্পিউটার নেটওয়ার্কে তথ্য কীভাবে আদান-প্রদান হয়? ক্ষ, জ্ঞ, ন্ত্র, র্দ্ধ —
                  এই যুক্তাক্ষরগুলো স্পষ্টভাবে পড়া যাচ্ছে কি?
                </p>
                <p className="mt-3 text-body text-muted-strong">
                  তথ্য ও যোগাযোগ প্রযুক্তির একটি গুরুত্বপূর্ণ ধারণা হলো computer network-এর topology। একটি
                  তথ্যপ্রযুক্তিভিত্তিক আন্তঃসংযোগব্যবস্থায় router, switch এবং protocol কীভাবে কাজ করে তা ব্যাখ্যা
                  করো। দীর্ঘ শব্দ: প্রযুক্তিনির্ভরতা, আন্তঃসংযোগব্যবস্থা।
                </p>
                <p className="mt-3 text-body">
                  বাংলা সংখ্যা: ৬৯ · গাণিতিক চিহ্ন: ১ + ২ + ৩ · উপপ্রশ্ন: (ক)
                </p>
              </div>
            </div>

            <div className="rounded-card border border-border bg-surface p-5 lg:col-span-2">
              <h3 className="text-h4">Geist Mono — code surface (dark in both themes)</h3>
              <pre className="code-surface mt-3 overflow-x-auto p-4">
                <code>{`#include <stdio.h>
int main(void) {
  int i = 0; /* `}<span lang="bn">{'মানটি এক ধাপ বাড়াও'}</span>{` */
  printf("%d\\n", i++);
  return 0;
}`}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* State tokens — never color alone */}
        <section aria-labelledby="states-heading" className="mt-10">
          <h2 id="states-heading" className="text-h3">
            State tokens <span className="text-muted-strong">/ অবস্থা</span>
          </h2>
          <p className="mt-1 text-small text-muted-strong">
            Every status pairs an icon, a label and a token — colour is never the only signal.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            <li className="flex items-start gap-3 rounded-card border border-success-border bg-success-bg p-4">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-success">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span className="text-body text-success-body">
                <strong className="font-strong">Success.</strong> Changes saved. Teal reuses the brand hue — not a new green.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-card border border-warning-border bg-warning-bg p-4">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-warning">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <span className="text-body text-warning-body">
                <strong className="font-strong">Warning.</strong> Review pending. Amber is for icons, badges and large text only.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-card border border-error-border bg-error-bg p-4">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-error">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <span className="text-body text-error-body">
                <strong className="font-strong">Error.</strong> Answer could not be saved. Red is reserved for errors and destructive actions.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-card border border-information-border bg-information-bg p-4">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-information-icon">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 12v4" />
                <path d="M12 8h.01" />
              </svg>
              <span className="text-body text-information">
                <strong className="font-strong">Information.</strong> Neutral by design — label and icon identify the message.
              </span>
            </li>
          </ul>
        </section>

        {/* Responsive grid foundation */}
        <section aria-labelledby="grid-heading" className="mt-10">
          <h2 id="grid-heading" className="text-h3">
            Responsive foundation <span className="text-muted-strong">/ রেসপনসিভ</span>
          </h2>
          <p className="mt-1 text-small text-muted-strong">
            4 columns (mobile) → 8 (tablet) → 12 (desktop) · 16 / 16 / 24 px gutters · 320 px minimum.
            Touch targets ≥ 44 × 44 px; mobile inputs ≥ 16 px text.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-3 md:grid-cols-8 md:gap-4 xl:grid-cols-12">
            <div className="col-span-4 rounded-card border border-border bg-surface p-4 md:col-span-8 xl:col-span-12">
              <p className="text-label text-muted-strong">12-col span</p>
              <p className="text-body">Full-width content region (examination workspace pattern).</p>
            </div>
            <div className="col-span-2 rounded-card border border-border bg-surface p-4 md:col-span-4 xl:col-span-6">
              <p className="text-label text-muted-strong">6-col</p>
              <p className="text-body">Reading column — question content.</p>
            </div>
            <div className="col-span-2 rounded-card border border-border bg-surface p-4 md:col-span-4 xl:col-span-4">
              <p className="text-label text-muted-strong">4-col</p>
              <p className="text-body">Supporting panel — metadata, sources.</p>
            </div>
            <div className="col-span-4 rounded-card border border-border bg-surface p-4 md:col-span-8 xl:col-span-2">
              <p className="text-label text-muted-strong">2-col</p>
              <p className="text-body">Rail</p>
            </div>
          </div>
        </section>

        {/* Foundation status */}
        <section aria-labelledby="status-heading" className="mt-10">
          <h2 id="status-heading" className="text-h3">
            Foundation status
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-body text-muted-strong">
            <li>Theme: Light default · Dark via <code className="font-mono text-code text-ink">.dark</code> on &lt;html&gt; · persisted to localStorage.</li>
            <li>Fonts: Geist Sans &amp; Geist Mono self-hosted via next/font · SolaimanLipi → Noto Sans Bengali stack (no binaries bundled — OD-25).</li>
            <li>Dark primary action: blocked pending owner decision (README §17.8 contrast conflict — see docs/design/design-system.md §2). No dark primary button ships.</li>
            <li>Database: Prisma 7 + PostgreSQL configured; no models or migrations yet — domain schema awaits open decisions OD-08–OD-13.</li>
            <li>Authentication: Supabase SSR plumbing configured; no login/registration screens yet.</li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-app-shell flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6 xl:px-8 2xl:px-10">
          <p className="text-caption text-muted-strong">
            ICT Atlas — Phase 03 application foundation · temporary specimen · tokens from README §17 /
            docs/design/tokens.json
          </p>
          <p className="text-caption text-muted-strong">
            <span lang="bn">পরীক্ষা নির্ভরযোগ্য হবে কেবল তখনই</span> · server-authoritative by design
          </p>
        </div>
      </footer>
    </div>
  );
}
