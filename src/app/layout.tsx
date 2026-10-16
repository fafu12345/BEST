import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '베스트부동산', description: '공인중개사무소 업무 관리' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="ko"><body className="bg-white text-slate-900 antialiased">{children}</body></html>;
}
