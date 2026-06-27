import './globals.css';
import { cookies } from 'next/headers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import ThemeToggle from '@/components/ThemeToggle';

// Match the live board's fonts exactly (dispatchboard_index.html).
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

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
  // Default to LIGHT (matches the HTML cockpit); only go dark if the tech has explicitly chosen it.
  // Read server-side so there's no flash of the wrong mode.
  const theme = cookies().get('theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <html lang="en" data-theme={theme} className={`${inter.variable} ${mono.variable}`}>
      <body>
        <div className="topbar">
          <img src="/logo.jpg" alt="Clog Busterz" style={{ height: 30, width: 'auto', borderRadius: 4 }} />
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
