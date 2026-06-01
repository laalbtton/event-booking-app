# Google Play store listing assets

## Tablet screenshots

Generated with:

```bash
npx playwright install chromium
node scripts/capture-play-store-tablet-screenshots.mjs
```

| Folder | Viewport | Play Console section |
|--------|----------|----------------------|
| `tablet-7inch/` | 1200×1920 (9:16) | 7-inch tablet screenshots |
| `tablet-10inch/` | 1600×2560 (9:16) | 10-inch tablet screenshots |

Upload **at least 2** PNGs from each folder (up to 8 per section).

Optional: set `SCREENSHOT_BASE_URL=http://localhost:3000` to capture from local dev.
