import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ConfirmDialogProvider } from '@/components/providers/confirm-dialog-provider'
import { GlobalAlertsProvider } from '@/components/providers/global-alerts-provider'
import { AuthBootstrapProvider } from '@/components/providers/auth-bootstrap-provider'
import { InstagramUsernamePromptProvider } from '@/components/providers/instagram-username-prompt-provider'
import { PushServiceWorkerProvider } from '@/components/providers/push-service-worker-provider'
import { CapacitorProvider } from '@/components/providers/capacitor-provider'
import RedButtonListener from '@/components/RedButtonListener'
import { InstallBonusProvider } from '@/components/providers/install-bonus-provider'
import { INSTALL_PROMPT_ENABLED } from '@/lib/featureFlags'
import { ThemeProvider } from '@/components/providers/theme-provider'
import AppNavigationShell from '@/components/AppNavigationShell'
import ConditionalAppFooter from '@/components/ConditionalAppFooter'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://app.laalbutton.com'),
  title: "One Mic Stand Event Booking",
  description: "Book comedy shows and events with credits",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "One Mic Stand",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

// Next.js 16+ expects themeColor under `viewport`, not `metadata`.
export const viewport: Viewport = {
  themeColor: "#000000",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        {/* Google tag (gtag.js) - Google Analytics */}
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-LTDFKZ4J5V" />
        <Script id="google-analytics">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-LTDFKZ4J5V');
          `}
        </Script>

        <ThemeProvider>
        <ConfirmDialogProvider>
          <AuthBootstrapProvider>
            <InstagramUsernamePromptProvider>
            <PushServiceWorkerProvider />
            <CapacitorProvider />
            <RedButtonListener />
            {INSTALL_PROMPT_ENABLED && <InstallBonusProvider />}
            <GlobalAlertsProvider />
            {/* Main content area */}
            <main className="flex-1">
              {children}
              <AppNavigationShell />
            </main>

            {/* Footer */}
            <ConditionalAppFooter />
            </InstagramUsernamePromptProvider>
          </AuthBootstrapProvider>
        </ConfirmDialogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}