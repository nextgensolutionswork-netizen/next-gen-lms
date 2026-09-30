import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/providers/auth-provider';

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
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
