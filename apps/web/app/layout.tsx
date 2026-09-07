import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Sans_Devanagari } from "next/font/google";
import localFont from "next/font/local";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { GlobalProviders } from "~/providers/global";
import { ServiceWorkerRegister } from "~/components/shared/service-worker-register";
import { cn } from "~/lib/utils";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600", "700"],
});
const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
  weight: ["400", "500", "600", "700"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          fraunces.variable,
          notoSansDevanagari.variable,
        )}
      >
        <GlobalProviders locale={locale} messages={messages}>
          {children}
        </GlobalProviders>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
