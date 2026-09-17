# App Store Connect listing screenshots

Generated with:

```bash
npx playwright install chromium
npm run screenshots:ios
```

| Folder | Pixels (portrait) | App Store Connect section |
|--------|-------------------|---------------------------|
| `iphone-6.5/` | 1284×2778 | **6.5" Display** (iPhone) |
| `ipad-13/` | 2064×2752 | **13" Display** (iPad) |

Upload **at least 2** PNGs per section (all 5 is fine). First three appear on the install sheet.

Use `04-login.png` and `05-signup.png` when Apple asks for screenshots that show **Sign in with Apple**.

Optional: set `SCREENSHOT_BASE_URL=http://localhost:3000` to capture from local dev.
