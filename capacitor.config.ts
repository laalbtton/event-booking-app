import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.laalbutton.app',
  appName: 'Laal Button',
  // webDir is required by Capacitor tooling even when server.url is used.
  // The Android WebView will load from server.url at runtime.
  webDir: 'out',
  server: {
    // Point the native WebView at the live hosted app so all Next.js
    // server features (API routes, auth, real-time) continue working.
    url: 'https://www.laalbutton.com',
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
