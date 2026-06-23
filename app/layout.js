import './globals.css';

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
  return (
    <html lang="en">
      <body>
        <div className="topbar">
          <span className="logo">🚐</span>
          <div style={{ flex: 1 }}>
            <div className="title">Sheetz</div>
            <div className="sub">Clog Busterz · web app (Vercel + Supabase)</div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
