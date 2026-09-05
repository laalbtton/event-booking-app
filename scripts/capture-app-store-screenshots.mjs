/**
 * Capture App Store Connect screenshots from the live app.
 *
 * Usage:
 *   npx playwright install chromium
 *   node scripts/capture-app-store-screenshots.mjs
 *
 * Output (portrait PNG, exact Apple sizes):
 *   app-store-assets/iphone-6.5/*.png   1284×2778  (6.5" Display)
 *   app-store-assets/ipad-13/*.png      2064×2752  (13" iPad Display)
 */

import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'https://app.laalbutton.com'

/** Public routes that render well without login */
const ROUTES = [
  { file: '01-home', path: '/' },
  { file: '02-events', path: '/events' },
  { file: '03-communities', path: '/communities' },
  { file: '04-login', path: '/login' },
]

/**
 * Viewport is CSS points; deviceScaleFactor produces Apple's required pixels.
 * 6.5"  = iPhone 14 Plus / 13 Pro Max  (428×926 @3x → 1284×2778)
 * 13"   = iPad Pro 13" M4              (1032×1376 @2x → 2064×2752)
 */
const SIZES = {
  'iphone-6.5': {
    viewport: { width: 428, height: 926 },
    deviceScaleFactor: 3,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  'ipad-13': {
    viewport: { width: 1032, height: 1376 },
    deviceScaleFactor: 2,
    isMobile: false,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
}

async function capture() {
  const browser = await chromium.launch({ headless: true })

  for (const [folder, opts] of Object.entries(SIZES)) {
    const outDir = path.join(ROOT, 'app-store-assets', folder)
    fs.mkdirSync(outDir, { recursive: true })

    const context = await browser.newContext({
      viewport: opts.viewport,
      deviceScaleFactor: opts.deviceScaleFactor,
      isMobile: opts.isMobile,
      hasTouch: true,
      userAgent: opts.userAgent,
    })

    const page = await context.newPage()

    for (const route of ROUTES) {
      const url = `${BASE_URL}${route.path}`
      console.log(`[${folder}] ${url}`)
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
        await page.waitForTimeout(1800)
        const filePath = path.join(outDir, `${route.file}.png`)
        await page.screenshot({
          path: filePath,
          type: 'png',
          fullPage: false,
          animations: 'disabled',
        })
        console.log(`  → ${filePath}`)
      } catch (err) {
        console.error(`  ✗ failed: ${err.message}`)
      }
    }

    await context.close()
  }

  await browser.close()
  console.log('\nDone. Upload PNGs from app-store-assets/iphone-6.5 and app-store-assets/ipad-13 to App Store Connect.')
}

capture().catch((err) => {
  console.error(err)
  process.exit(1)
})
