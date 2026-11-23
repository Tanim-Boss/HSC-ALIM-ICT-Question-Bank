import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeToggle } from '@/components/theme-toggle';

describe('ThemeToggle', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    window.localStorage.clear();
  });

  it('renders in light mode by default and exposes an accessible name', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /switch to dark theme/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggles to dark mode, persists the choice and updates aria-pressed', async () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /switch to dark theme/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('ict-atlas-theme')).toBe('dark');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /switch to light theme/i }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('toggles back to light mode and persists that choice', async () => {
    document.documentElement.classList.add('dark');
    window.localStorage.setItem('ict-atlas-theme', 'dark');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('ict-atlas-theme')).toBe('light');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /switch to dark theme/i }),
      ).toHaveAttribute('aria-pressed', 'false'),
    );
  });
});
