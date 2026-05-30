import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shorts Automation Dashboard',
  description: 'YouTube Shorts automation control panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-brand-dark">{children}</body>
    </html>
  );
}
