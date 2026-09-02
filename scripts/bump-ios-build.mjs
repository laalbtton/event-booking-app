/**
 * Increment ios/App CURRENT_PROJECT_VERSION (the TestFlight build number).
 *
 * Usage:
 *   node scripts/bump-ios-build.mjs        # +1
 *   node scripts/bump-ios-build.mjs 12     # set to 12
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pbxprojPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj')
const pbxproj = readFileSync(pbxprojPath, 'utf8')
const matches = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)]

if (matches.length === 0) {
  console.error('No CURRENT_PROJECT_VERSION found in project.pbxproj')
  process.exit(1)
}

const current = Number(matches[0][1])
const requested = process.argv[2]
const next = requested ? Number(requested) : current + 1

if (!Number.isInteger(next) || next < 1) {
  console.error('Build number must be a positive integer')
  process.exit(1)
}

if (next <= current) {
  console.error(`New build number (${next}) must be greater than current (${current})`)
  process.exit(1)
}

const updated = pbxproj.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`)
writeFileSync(pbxprojPath, updated)
console.log(`iOS build number ${current} → ${next}`)
