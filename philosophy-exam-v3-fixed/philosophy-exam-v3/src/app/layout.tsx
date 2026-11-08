import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'PHILOSOPHY EXAM',
  description: 'Hệ thống thi trắc nghiệm Triết học trực tuyến',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className="min-h-screen bg-navy font-sans text-slate-100 antialiased">{children}</body>
    </html>
  );
}
