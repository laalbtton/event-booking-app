import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from 'next/link'
import { ConfirmDialogProvider } from '@/components/providers/confirm-dialog-provider'
import { GlobalAlertsProvider } from '@/components/providers/global-alerts-provider'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Laal Button Event Booking",
  description: "Book comedy shows and events with credits",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Laal Button",
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
  themeColor: "#2563eb", // Keep aligned with `public/manifest.json` theme_color
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
        <ConfirmDialogProvider>
          <GlobalAlertsProvider />
          {/* Main content area */}
          <main className="flex-1">
            {children}
          </main>

          {/* Footer */}
          <footer className="bg-gray-800 text-white py-6 mt-auto pb-28">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <p className="text-sm">© 2025 Laal Button. All rights reserved.</p>
                <div className="flex gap-6">
                  <Link href="/contact" className="text-sm hover:text-gray-300">
                    Contact
                  </Link>
                  <Link href="/buy-credits" className="text-sm hover:text-gray-300">
                    Buy Credits
                  </Link>
                  <a 
                    href="https://laalbutton.com" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:text-gray-300"
                  >
                    About
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </ConfirmDialogProvider>
      </body>
    </html>
  );
}