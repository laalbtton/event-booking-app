import { supabase } from '@/lib/supabase'

export const MAX_POSTER_BYTES = 10 * 1024 * 1024

/**
 * Must stay in sync with the `event-posters` bucket's allowed_mime_types. The
 * bucket rejects anything else, so checking here turns a generic storage
 * rejection into a message that tells the user what to do about it.
 */
export const POSTER_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/**
 * Some Android WebView pickers hand back a File with an empty `type`, so fall
 * back to the extension before deciding the file is unusable.
 */
function resolveContentType(file: File): string | null {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  return (extension && EXTENSION_MIME_TYPES[extension]) || null
}

/** Returns a user-facing message when the file cannot be used, otherwise null. */
export function validatePosterFile(file: File): string | null {
  const contentType = resolveContentType(file)

  if (!contentType || !contentType.startsWith('image/')) {
    return 'Please choose an image file'
  }
  if (!POSTER_ALLOWED_MIME_TYPES.includes(contentType as (typeof POSTER_ALLOWED_MIME_TYPES)[number])) {
    const label = contentType.replace('image/', '').toUpperCase()
    return `${label} images aren't supported. Please use a JPEG, PNG or WebP.`
  }
  if (file.size === 0) {
    return "That image came through empty. Try picking it again, or save it to your device first."
  }
  if (file.size > MAX_POSTER_BYTES) {
    return 'Poster file must be 10MB or smaller'
  }
  return null
}

/**
 * Uploads a poster to storage and returns its public URL.
 *
 * The bytes are pulled into memory before the request rather than handing the
 * File to fetch directly. On Android the WebView backs a picked File with a
 * content:// stream that can be closed before fetch reads it — especially for
 * cloud-backed gallery items — which fails the request at the network layer and
 * surfaces only as "Failed to fetch" with no indication of the cause. Reading
 * first makes the upload independent of that stream and turns an unreadable file
 * into an explicit error.
 */
export async function uploadPosterImage(eventId: string, file: File): Promise<string> {
  const contentType = resolveContentType(file) ?? 'application/octet-stream'

  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    throw new Error(
      "Couldn't read the selected image. If it's stored in a cloud album, download it to your device first.",
    )
  }

  if (bytes.byteLength === 0) {
    throw new Error("Couldn't read the selected image. Try picking it again.")
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${eventId}/${Date.now()}-${cleanName}`

  const { error: uploadError } = await supabase.storage
    .from('event-posters')
    .upload(path, bytes, { upsert: false, cacheControl: '3600', contentType })

  if (uploadError) {
    throw new Error(`Couldn't upload the image: ${uploadError.message}`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('event-posters').getPublicUrl(path)

  return publicUrl
}

type PosterUpdateResult = { jobs?: { totalAttendees: number; jobsQueued: number; jobsSkipped: number } }

type PosterUpdatePayload =
  | { eventId: string; action: 'set'; posterUrl: string; posterCaption: string | null }
  | { eventId: string; action: 'remove' }

/**
 * Calls /api/posters/update, separating "never reached the server" from "server
 * said no" so the two failures don't share one opaque message.
 */
export async function savePosterUpdate(payload: PosterUpdatePayload): Promise<PosterUpdateResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Not authenticated')

  let response: Response
  try {
    response = await fetch('/api/posters/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error("Couldn't reach the server to save the poster. Check your connection and try again.")
  }

  const result = (await response.json().catch(() => ({}))) as PosterUpdateResult & { error?: string }
  if (!response.ok) {
    throw new Error(result.error || 'Failed to save poster')
  }
  return result
}
