/**
 * Platform utilities: thin wrappers around Capacitor plugins with web
 * fallbacks. Every function is safe to call on the web; native-only features
 * report their availability so the UI can hide or disable them.
 *
 * All Capacitor imports are dynamic so the web bundle stays small and SSR
 * never touches `window`.
 */

export type PickedContact = {
  name: string
  email: string | null
  phone: string | null
}

async function getCapacitor() {
  const mod = await import('@capacitor/core')
  return mod.Capacitor
}

export async function isNativePlatform(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const Capacitor = await getCapacitor()
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export async function getPlatform(): Promise<'ios' | 'android' | 'web'> {
  if (typeof window === 'undefined') return 'web'
  try {
    const Capacitor = await getCapacitor()
    const p = Capacitor.getPlatform()
    return p === 'ios' || p === 'android' ? p : 'web'
  } catch {
    return 'web'
  }
}

// ── Haptics ─────────────────────────────────────────────────

export async function hapticLight(): Promise<void> {
  if (!(await isNativePlatform())) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Haptics are a nicety; never fail the action over them.
  }
}

export async function hapticSuccess(): Promise<void> {
  if (!(await isNativePlatform())) return
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType.Success })
  } catch {
    // ignore
  }
}

// ── Contacts (native only) ──────────────────────────────────

export type ContactPickResult =
  | { status: 'picked'; contact: PickedContact }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

/**
 * Lets the user pick ONE contact from the system picker. Permission is
 * requested only when this is called (i.e. on tap), and we never enumerate
 * the whole address book.
 */
export async function pickSingleContact(): Promise<ContactPickResult> {
  if (!(await isNativePlatform())) return { status: 'unavailable' }
  try {
    const { Contacts } = await import('@capacitor-community/contacts')

    const perm = await Contacts.requestPermissions()
    if (perm.contacts !== 'granted' && perm.contacts !== 'limited') {
      return { status: 'denied' }
    }

    const result = await Contacts.pickContact({
      projection: { name: true, phones: true, emails: true },
    })
    const c = result?.contact
    if (!c) return { status: 'cancelled' }

    const name =
      c.name?.display?.trim() ||
      [c.name?.given, c.name?.family].filter(Boolean).join(' ').trim() ||
      ''
    const email = c.emails?.find((e) => e.address)?.address?.trim() || null
    const phone = c.phones?.find((p) => p.number)?.number?.trim() || null

    return { status: 'picked', contact: { name, email, phone } }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    // The community plugin rejects with a generic error when the user backs
    // out of the picker on some Android versions.
    if (/cancel/i.test(message)) return { status: 'cancelled' }
    return { status: 'error', message }
  }
}

// ── Clipboard ───────────────────────────────────────────────

export async function copyText(text: string): Promise<boolean> {
  if (await isNativePlatform()) {
    try {
      const { Clipboard } = await import('@capacitor/clipboard')
      await Clipboard.write({ string: text })
      return true
    } catch {
      // fall through to web API
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// ── File export / share ─────────────────────────────────────

/**
 * Saves text as a file. On native it writes to the cache dir and opens the
 * share sheet (so the user can AirDrop / save to Files / email it). On web
 * it triggers a download.
 */
export async function saveOrShareTextFile(opts: {
  filename: string
  content: string
  mimeType: string
  title?: string
}): Promise<'shared' | 'downloaded' | 'failed'> {
  if (await isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const { Share } = await import('@capacitor/share')
      const written = await Filesystem.writeFile({
        path: opts.filename,
        data: opts.content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      await Share.share({
        title: opts.title ?? opts.filename,
        files: [written.uri],
        dialogTitle: opts.title ?? 'Export',
      })
      return 'shared'
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // User dismissed the share sheet — not a failure worth surfacing.
      if (/cancel/i.test(message)) return 'shared'
      console.error('Native share failed', err)
      return 'failed'
    }
  }

  try {
    const blob = new Blob([opts.content], { type: opts.mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = opts.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'downloaded'
  } catch (err) {
    console.error('Download failed', err)
    return 'failed'
  }
}

// ── External links ──────────────────────────────────────────

/**
 * Opens an Instagram profile. On native we try the Instagram app deep link
 * first and fall back to the web profile in the system browser.
 */
export async function openInstagramProfile(handle: string): Promise<void> {
  const webUrl = `https://instagram.com/${encodeURIComponent(handle)}`
  if (await isNativePlatform()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher')
      const deepLink = `instagram://user?username=${encodeURIComponent(handle)}`
      const { value: canOpen } = await AppLauncher.canOpenUrl({ url: deepLink })
      if (canOpen) {
        await AppLauncher.openUrl({ url: deepLink })
        return
      }
    } catch {
      // fall through to browser
    }
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: webUrl })
      return
    } catch {
      // fall through to window.open
    }
  }
  window.open(webUrl, '_blank', 'noopener,noreferrer')
}

/** tel: / mailto: work on both platforms via a plain anchor; this helper just
 * centralises it so native quirks can be handled in one place later. */
export async function openExternalScheme(url: string): Promise<void> {
  if (await isNativePlatform()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher')
      await AppLauncher.openUrl({ url })
      return
    } catch {
      // fall through
    }
  }
  window.location.href = url
}
