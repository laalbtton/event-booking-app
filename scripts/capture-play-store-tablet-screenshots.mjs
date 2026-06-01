/**
 * Capture Google Play tablet listing screenshots from the live app.
 *
 * Usage:
 *   npx playwright install chromium
 *   node scripts/capture-play-store-tablet-screenshots.mjs
 *
 * Output:
 *   play-store-assets/tablet-7inch/*.png  (1200×1920, 9:16)
 *   play-store-assets/tablet-10inch/*.png (1600×2560, 9:16)
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

const TABLET_SIZES = {
  'tablet-7inch': { width: 1200, height: 1920 },
  'tablet-10inch': { width: 1600, height: 2560 },
}

async function capture() {
  const browser = await chromium.launch({ headless: true })

  for (const [folder, viewport] of Object.entries(TABLET_SIZES)) {
    const outDir = path.join(ROOT, 'play-store-assets', folder)
    fs.mkdirSync(outDir, { recursive: true })

    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()

    for (const route of ROUTES) {
      const url = `${BASE_URL}${route.path}`
      console.log(`[${folder}] ${url}`)
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
        await page.waitForTimeout(1500)
        const filePath = path.join(outDir, `${route.file}.png`)
        await page.screenshot({ path: filePath, type: 'png', fullPage: false })
        console.log(`  → ${filePath}`)
      } catch (err) {
        console.error(`  ✗ failed: ${err.message}`)
      }
    }

    await context.close()
  }

  await browser.close()
  console.log('\nDone. Upload PNGs from play-store-assets/tablet-7inch and tablet-10inch to Play Console.')
}

capture().catch((err) => {
  console.error(err)
  process.exit(1)
})
