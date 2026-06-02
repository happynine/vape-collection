import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Vape品牌商官网查找系统',
    template: '%s | Vape品牌商官网查找系统',
  },
  description: '快速查找全球 Vape 品牌官方网站',
  keywords: ['Vape', '电子烟', '品牌', '官网', '查找'],
  robots: {
    index: true,
    follow: true as const,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
