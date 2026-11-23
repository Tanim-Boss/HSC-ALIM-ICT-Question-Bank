import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ICT Atlas — HSC / Alim ICT Question Bank & Examination Platform',
    template: '%s · ICT Atlas',
  },
  description:
    'ICT Atlas is a question bank and online examination platform for HSC / Alim ICT (তথ্য ও যোগাযোগ প্রযুক্তি) under the NCTB curriculum.',
  applicationName: 'ICT Atlas',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAFA' },
    { media: '(prefers-color-scheme: dark)', color: '#090B0D' },
  ],
};

/**
 * Applies the persisted theme before first paint to avoid a flash of the
 * unintended theme. Light is the product default (README §17.2); "dark" is
 * opt-in via the toggle in the application shell and is only applied when
 * the user has explicitly stored that choice. System preference never
 * overrides the light default. Kept dependency-free on purpose.
 */
const themeInitScript = `(function(){try{var t=window.localStorage.getItem('ict-atlas-theme');if(t==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(error){/* default light theme */}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body>
        {/* Blocking pre-hydration theme bootstrap: keep as the first body child. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
