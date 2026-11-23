'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'ict-atlas-theme';

const subscribe = (onStoreChange: () => void) => {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
};

const getSnapshot = () => document.documentElement.classList.contains('dark');
const getServerSnapshot = () => false;

/**
 * Light/dark theme toggle for the application shell.
 *
 * Light is the product default (README §17.2). The choice is persisted in
 * localStorage under `ict-atlas-theme` and reflected through the `.dark`
 * class on <html> (managed by the pre-hydration bootstrap in app/layout.tsx).
 * State is read via useSyncExternalStore so the toggle always mirrors the
 * real document class — including changes made by other tabs or scripts.
 */
export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // Persistence unavailable (private mode etc.) — theme still applies for this session.
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-touch w-touch items-center justify-center rounded-control border border-border bg-surface text-ink transition-colors duration-120 hover:bg-surface-hover"
    >
      {isDark ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}
