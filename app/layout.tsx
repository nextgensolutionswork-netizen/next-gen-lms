import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/providers/auth-provider';
import { RouteProgressBar } from '@/components/ui/route-progress-bar';

export const metadata: Metadata = {
  title: 'Next-Gen ERP LMS | Enterprise Training & Institute Management',
  description: 'Production-ready full-stack LMS & ERP for SAP Professional Training Institute',
  keywords: ['LMS', 'SAP Training', 'SAP FICO', 'SAP MM', 'SAP SD', 'SAP ABAP', 'Institute ERP'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="bg-slate-50">
      <body className="min-h-screen bg-slate-50 font-sans antialiased text-foreground">
        <RouteProgressBar />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
