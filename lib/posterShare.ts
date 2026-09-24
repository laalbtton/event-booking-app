import { formatDateTime } from '@/lib/dateUtils'
import { absolutizePosterUrl } from '@/lib/eventPosterDefaults'

export function eventPosterSharePath(eventIdOrSlug: string): string {
  return `/events/${eventIdOrSlug}?share=poster`
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function buildPosterShareText(args: {
  title: string
  caption?: string | null
  eventUrl: string
  eventDate?: string | null
  location?: string | null
}): string {
  const lines: string[] = [args.title]
  if (args.eventDate) lines.push(`When: ${formatDateTime(args.eventDate)}`)
  if (args.location) lines.push(`Where: ${args.location}`)
  const caption = args.caption?.trim()
  if (caption) {
    lines.push('')
    lines.push(caption)
  }
  lines.push('')
  lines.push(args.eventUrl)
  return lines.join('\n')
}

function eventPageUrl(eventIdOrSlug: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${`/events/${eventIdOrSlug}`}`
}

async function tryShareImageFile(args: {
  title: string
  text: string
  imageUrl: string
}): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  try {
    const res = await fetch(args.imageUrl)
    if (!res.ok) return false
    const blob = await res.blob()
    const ext = blob.type.includes('png') ? 'png' : 'jpg'
    const file = new File([blob], `poster.${ext}`, { type: blob.type || 'image/jpeg' })
    const data: ShareData = { title: args.title, text: args.text, files: [file] }
    if (navigator.canShare && !navigator.canShare(data)) return false
    await navigator.share(data)
    return true
  } catch {
    return false
  }
}

export async function sharePosterNative(args: {
  title: string
  text: string
  eventUrl: string
  posterUrl?: string | null
}): Promise<'shared' | 'copied' | 'cancelled'> {
  const absolutePoster = args.posterUrl
    ? absolutizePosterUrl(args.posterUrl, typeof window !== 'undefined' ? window.location.origin : '')
    : null

  if (absolutePoster) {
    const sharedFile = await tryShareImageFile({
      title: args.title,
      text: args.text,
      imageUrl: absolutePoster,
    })
    if (sharedFile) return 'shared'
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({
        title: args.title,
        text: args.text,
        url: args.eventUrl,
      })
      return 'shared'
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'AbortError') return 'cancelled'
  }

  try {
    await navigator.clipboard.writeText(args.text)
    return 'copied'
  } catch {
    return 'cancelled'
  }
}

export function openWhatsAppShare(text: string) {
  const url = buildWhatsAppShareUrl(text)
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function buildEventShareUrl(eventIdOrSlug: string): string {
  return eventPageUrl(eventIdOrSlug)
}
