export type InstallPlatform = 'ios' | 'android' | 'other'

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredInstallPromptEvent: DeferredInstallPromptEvent | null = null
let captureInitialized = false
const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach((callback) => callback())
}

export function initInstallPromptCapture() {
  if (typeof window === 'undefined' || captureInitialized) return
  captureInitialized = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredInstallPromptEvent = event as DeferredInstallPromptEvent
    notifySubscribers()
  })

  window.addEventListener('appinstalled', () => {
    deferredInstallPromptEvent = null
    notifySubscribers()
  })
}

export function subscribeToInstallPromptChanges(callback: () => void) {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

export function hasDeferredInstallPrompt() {
  return !!deferredInstallPromptEvent
}

export async function triggerDeferredInstallPrompt() {
  if (!deferredInstallPromptEvent) {
    return { supported: false as const, outcome: 'dismissed' as const }
  }

  const promptEvent = deferredInstallPromptEvent
  await promptEvent.prompt()
  const choice = await promptEvent.userChoice
  if (choice.outcome === 'accepted') {
    deferredInstallPromptEvent = null
    notifySubscribers()
  }

  return { supported: true as const, outcome: choice.outcome }
}

export function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  const mediaStandalone = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = Boolean((window.navigator as any).standalone)
  return mediaStandalone || iosStandalone
}

export function getInstallPlatform(): InstallPlatform {
  if (typeof window === 'undefined') return 'other'
  const ua = window.navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isAndroid = /android/.test(ua)
  if (isIOS) return 'ios'
  if (isAndroid) return 'android'
  return 'other'
}

export function getInstallBannerDismissedKey(userId: string) {
  return `a2hs_banner_dismissed:${userId}`
}

export function getInstallOnboardingSkippedKey(userId: string) {
  return `a2hs_onboarding_skipped:${userId}`
}
