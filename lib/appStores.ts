export const APP_STORE_URL = 'https://apps.apple.com/us/app/one-mic-stand/id6806655861'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.laalbutton.app'
/** Public page with App Store, Play Store, and web-app install. */
export const DOWNLOAD_PATH = '/download'

/** Official badge artwork (hosted by Apple / Google) — use in emails so images load without our CDN. */
export const APP_STORE_BADGE_IMG =
  'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83'
export const PLAY_STORE_BADGE_IMG =
  'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png'

/** Shared footer block for transactional and broadcast emails. */
export function emailAppStoreBadgesHtml(copyrightExtra?: string): string {
  const year = new Date().getFullYear()
  return `
    <div style="text-align:center;margin:18px 0 6px 0;">
      <p style="margin:0 0 10px 0;font-size:12px;color:#78716c;letter-spacing:0.02em;">Get the One Mic Stand app</p>
      <a href="${APP_STORE_URL}" style="display:inline-block;margin:0 4px 6px 4px;text-decoration:none;">
        <img src="${APP_STORE_BADGE_IMG}" alt="Download on the App Store" height="40" style="height:40px;width:auto;border:0;vertical-align:middle;" />
      </a>
      <a href="${PLAY_STORE_URL}" style="display:inline-block;margin:0 4px 6px 4px;text-decoration:none;">
        <img src="${PLAY_STORE_BADGE_IMG}" alt="Get it on Google Play" height="58" style="height:58px;width:auto;border:0;vertical-align:middle;margin:-9px 0;" />
      </a>
      <p style="margin:10px 0 0 0;font-size:12px;color:#9ca3af;">© ${year} One Mic Stand. All rights reserved.</p>
      ${copyrightExtra ? `<p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">${copyrightExtra}</p>` : ''}
    </div>`
}
