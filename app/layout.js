import './globals.css';
import { cookies } from 'next/headers';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata = {
  title: 'Sheetz — CB',
  description: 'Clog Busterz field + dispatch platform',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  // Read the saved theme server-side so there's no flash of the wrong mode.
  const theme = cookies().get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <div className="topbar">
          <span className="logo">🚐</span>
          <div style={{ flex: 1 }}>
            <div className="title">Sheetz</div>
            <div className="sub">Clog Busterz · web app (Vercel + Supabase)</div>
          </div>
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
