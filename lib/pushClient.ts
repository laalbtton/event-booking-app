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

/**
 * Subscribe the current user to push notifications.
 *
 * On a native Capacitor build the function delegates to FCM registration via
 * the @capacitor/push-notifications plugin.  The actual token upload is handled
 * by the CapacitorProvider which listens for the 'registration' event — this
 * function only requests permission and calls register() to trigger that flow.
 *
 * On the web the existing VAPID / service-worker path is used unchanged.
 */
export async function subscribeCurrentUserToPush(accessToken: string): Promise<{
  permission: NotificationPermission
  subscribed: boolean
  errorMessage?: string
}> {
  // Detect native Capacitor environment via dynamic import to avoid SSR errors.
  let isNative = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    isNative = Capacitor.isNativePlatform()
  } catch {
    isNative = false
  }

  if (isNative) {
    return subscribeNative(accessToken)
  }

  // --- Web push path (unchanged) ---
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

/**
 * Native FCM registration path.
 *
 * Requests permission then triggers register().  The CapacitorProvider
 * (mounted in app/layout.tsx) listens for the 'registration' event and
 * sends the token to /api/push/register-fcm.
 */
async function subscribeNative(accessToken: string): Promise<{
  permission: NotificationPermission
  subscribed: boolean
  errorMessage?: string
}> {
  const [{ PushNotifications }, { Capacitor }] = await Promise.all([
    import('@capacitor/push-notifications'),
    import('@capacitor/core'),
  ])

  const result = await PushNotifications.requestPermissions()

  if (result.receive === 'denied') {
    return { permission: 'denied', subscribed: false, errorMessage: 'Notification permission denied by user' }
  }

  return new Promise<{ permission: NotificationPermission; subscribed: boolean; errorMessage?: string }>((resolve) => {
    let settled = false

    const settle = (subscribed: boolean, errorMessage?: string) => {
      if (settled) return
      settled = true
      resolve({ permission: 'granted', subscribed, errorMessage })
    }

    // Await both listeners before calling register() to avoid a race where
    // the FCM registration event fires before our JS handler is attached.
    Promise.all([
      PushNotifications.addListener('registration', async (token) => {
        try {
          const platform = Capacitor.getPlatform()
          const res = await fetch('/api/push/register-fcm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ fcmToken: token.value, platform }),
          })
          if (res.ok) {
            settle(true)
          } else {
            const body = await res.json().catch(() => ({}))
            settle(false, `Server rejected token (${res.status}): ${body?.error ?? 'unknown error'}`)
          }
        } catch (err: unknown) {
          settle(false, `Network error saving token: ${err instanceof Error ? err.message : String(err)}`)
        }
      }),
      PushNotifications.addListener('registrationError', (err: unknown) => {
        const msg =
          err && typeof err === 'object' && 'error' in err
            ? String((err as { error: unknown }).error)
            : JSON.stringify(err)
        settle(false, `FCM registration error: ${msg}`)
      }),
    ]).then(([regHandle, errHandle]) => {
      // Call register() only after both listeners are confirmed attached.
      PushNotifications.register()

      // Timeout safety net — 20 s should be plenty for FCM to respond.
      setTimeout(() => {
        regHandle.remove()
        errHandle.remove()
        settle(false, 'FCM registration timed out after 20 s. Check Google Play Services on this device.')
      }, 20_000)
    })
  })
}

export async function unsubscribeCurrentUserFromPush(accessToken: string) {
  let isNative = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    isNative = Capacitor.isNativePlatform()
  } catch {
    isNative = false
  }

  if (isNative) {
    // Deactivate all subscriptions for this user (no endpoint needed).
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    })
    return
  }

  // Web path (unchanged)
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
