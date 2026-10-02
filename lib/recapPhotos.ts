import { supabase, type EventRecapPhoto } from '@/lib/supabase'

export const RECAP_BUCKET = 'event-recap-photos'
export const MAX_RECAP_PHOTO_BYTES = 8 * 1024 * 1024
export const MAX_RECAP_PHOTOS_PER_POST = 10
export const RECAP_POST_DELAY_HOURS = 2
export const RECAP_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const

const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export function recapPostReadyAt(eventDateIso: string, endTimeIso: string | null): Date {
  const end = new Date(endTimeIso || eventDateIso)
  return new Date(end.getTime() + RECAP_POST_DELAY_HOURS * 60 * 60 * 1000)
}

function resolveContentType(file: File): string | null {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  return (extension && EXTENSION_MIME_TYPES[extension]) || null
}

export function validateRecapPhotoFile(file: File): string | null {
  const contentType = resolveContentType(file)
  if (!contentType || !contentType.startsWith('image/')) {
    return 'Please choose an image file'
  }
  if (!RECAP_ALLOWED_MIME_TYPES.includes(contentType as (typeof RECAP_ALLOWED_MIME_TYPES)[number])) {
    return 'Use a JPEG or PNG. Instagram carousel posts do not accept WebP.'
  }
  if (file.size === 0) {
    return 'That image came through empty. Try picking it again.'
  }
  if (file.size > MAX_RECAP_PHOTO_BYTES) {
    return 'Each photo must be 8MB or smaller'
  }
  return null
}

export async function uploadRecapPhotoFile(eventId: string, file: File): Promise<{ storagePath: string; publicUrl: string }> {
  const contentType = resolveContentType(file) ?? 'image/jpeg'
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    throw new Error("Couldn't read the selected image. Download it to your device first.")
  }
  if (bytes.byteLength === 0) {
    throw new Error("Couldn't read the selected image. Try picking it again.")
  }

  const ext = contentType === 'image/png' ? 'png' : 'jpg'
  const storagePath = `${eventId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(RECAP_BUCKET)
    .upload(storagePath, bytes, { upsert: false, cacheControl: '3600', contentType })

  if (uploadError) {
    throw new Error(`Couldn't upload the image: ${uploadError.message}`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(RECAP_BUCKET).getPublicUrl(storagePath)

  return { storagePath, publicUrl }
}

async function recapAuthHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export type RecapPhotosResponse = {
  photos: EventRecapPhoto[]
  caption: string
  postReadyAt: string
  instagramConnected: boolean
  canManage: boolean
}

export async function fetchRecapPhotos(eventId: string): Promise<RecapPhotosResponse> {
  const headers = await recapAuthHeaders()
  const response = await fetch(`/api/events/${eventId}/recap-photos`, { headers })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Could not load recap photos')
  }
  return result as RecapPhotosResponse
}

export async function saveRecapPhotoRecords(
  eventId: string,
  photos: Array<{ storagePath: string; publicUrl: string }>
) {
  const headers = await recapAuthHeaders()
  const response = await fetch(`/api/events/${eventId}/recap-photos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ photos }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Could not save recap photos')
  }
  return result as { photos: EventRecapPhoto[] }
}

export async function saveRecapCaption(eventId: string, caption: string) {
  const headers = await recapAuthHeaders()
  const response = await fetch(`/api/events/${eventId}/recap-photos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ caption }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Could not save caption')
  }
  return result as { caption: string }
}

export async function deleteRecapPhoto(eventId: string, photoId: string) {
  const headers = await recapAuthHeaders()
  const response = await fetch(`/api/events/${eventId}/recap-photos/${photoId}`, {
    method: 'DELETE',
    headers,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Could not remove photo')
  }
}
