export type PushClientState = {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
}

export function getPushClientState(): PushClientState {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'unsupported' }
  }
  const supported =
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    window.isSecureContext

  return {
    supported,
    permission: supported ? Notification.permission : 'unsupported',
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service worker is not supported')
  }
  const reg = await navigator.serviceWorker.getRegistration()
  if (reg) return reg
  return navigator.serviceWorker.register('/sw.js')
}

export async function subscribeCurrentUserToPush(accessToken: string): Promise<{
  permission: NotificationPermission
  subscribed: boolean
}> {
  const state = getPushClientState()
  if (!state.supported) {
    throw new Error('Push notifications are not supported on this device/browser')
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) {
    throw new Error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { permission, subscribed: false }
  }

  const registration = await getServiceWorkerRegistration()
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    })
  }

  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ subscription }),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Failed to save push subscription')
  }

  return { permission, subscribed: true }
}

export async function unsubscribeCurrentUserFromPush(accessToken: string) {
  const state = getPushClientState()
  if (!state.supported) return

  const registration = await navigator.serviceWorker.getRegistration()
  const existing = registration ? await registration.pushManager.getSubscription() : null
  const endpoint = existing?.endpoint || null

  if (existing) {
    await existing.unsubscribe().catch(() => undefined)
  }

  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ endpoint }),
  })
}

