import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.laalbutton.app',
  appName: 'One Mic Stand',
  // Capacitor requires webDir to exist with an index.html, even when server.url
  // is used and the assets are never shown. It cannot be `out`: Next.js builds a
  // server app, not a static export, so no `out` directory is ever produced and
  // `cap sync` fails on a clean checkout (CI included).
  webDir: 'capacitor-webdir',
  server: {
    // Point the native WebView at the live hosted app so all Next.js
    // server features (API routes, auth, real-time) continue working.
    url: 'https://app.laalbutton.com',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      // Show system banner + sound + badge while the app is in foreground.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000',
    },
  },
}

export default config
