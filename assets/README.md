# App icon source

- `icon.png` — 1024×1024 master used by `@capacitor/assets` for Android and iOS launcher icons (and splash screens).

Regenerate after editing:

```bash
npm run assets:android
npx cap sync android
npm run assets:ios
```

Or both: `npm run assets:native`.

iOS uses this same file for the home-screen icon and for the small icon on notifications. iOS does not support a separate status-bar silhouette the way Android does.

Play Store uploads (not generated into the APK): see `play-store-assets/app-icon-512.png` and `play-store-assets/feature-graphic.png`.
