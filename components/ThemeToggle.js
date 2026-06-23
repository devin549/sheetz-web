'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') || 'dark');
  }, []);

  function toggle() {
    const next = (document.documentElement.getAttribute('data-theme') === 'light') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    document.cookie = 'theme=' + next + '; path=/; max-age=' + (60 * 60 * 24 * 365);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      title="Toggle light / dark"
      aria-label="Toggle light or dark mode"
      style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-2)',
        borderRadius: 8, padding: '7px 11px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
    </button>
  );
}
