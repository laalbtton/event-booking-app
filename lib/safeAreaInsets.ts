/**
 * Android WebViews (especially targetSdk 35+) often report
 * env(safe-area-inset-*) as 0 while still drawing under the system bars.
 * When that happens, set CSS fallback classes so chrome stays clear of
 * the clock and the 3-button / gesture nav.
 */
function readEnvInset(side: 'top' | 'bottom'): number {
  if (typeof document === 'undefined') return 0
  const el = document.createElement('div')
  el.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;padding-${side}:env(safe-area-inset-${side},0px)`
  document.body.appendChild(el)
  const value = parseFloat(getComputedStyle(el).getPropertyValue(`padding-${side}`)) || 0
  el.remove()
  return value
}

export function applySafeAreaFallbacks(options?: { nativeStatusBarInset?: boolean }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const isAndroid = /Android/i.test(navigator.userAgent)
  if (!isAndroid) return

  const root = document.documentElement
  root.classList.add('capacitor-android')

  const bottom = readEnvInset('bottom')
  const top = readEnvInset('top')
  const systemConsumed = Math.max(0, (window.screen?.height || 0) - window.innerHeight)
  const edgeToEdge = systemConsumed < 28

  if (bottom < 16 && edgeToEdge) {
    root.classList.add('android-nav-inset-fallback')
  } else {
    root.classList.remove('android-nav-inset-fallback')
  }

  const skipTopFallback = !!options?.nativeStatusBarInset
  if (top < 16 && edgeToEdge && !skipTopFallback) {
    root.classList.add('android-status-inset-fallback')
  } else {
    root.classList.remove('android-status-inset-fallback')
  }
}
