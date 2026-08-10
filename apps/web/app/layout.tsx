import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { GlobalProviders } from "~/providers/global";
import { ServiceWorkerRegister } from "~/components/shared/service-worker-register";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Motake",
  description: "Sales order taking app",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Motake",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#008f39",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <GlobalProviders>{children}</GlobalProviders>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
