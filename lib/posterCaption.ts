type PosterCaptionEvent = {
  title?: string | null
  date?: string | null
  location?: string | null
  event_type?: 'open_mic' | 'booked_show' | string | null
  theme?: string | null
  languages?: string[] | null
  tickets_enabled?: boolean | null
  external_event?: boolean | null
  external_ticket_url?: string | null
  credits_required?: number | null
}

export const MAX_CAPTION_CHARS = 1200
const MAX_HASHTAGS = 12

function formatEventDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toSafeTag(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '')
}

function pickHashtags(event: PosterCaptionEvent): string[] {
  const tags = ['#LiveEvent']
  if (event.event_type === 'open_mic') {
    tags.push('#OpenMic', '#LiveComedy')
  } else if (event.event_type === 'booked_show') {
    tags.push('#BookedShow', '#LivePerformance')
  } else {
    tags.push('#NightOut')
  }
  const titleTag = toSafeTag((event.title || '').trim())
  if (titleTag.length >= 4 && titleTag.length <= 24) tags.push(`#${titleTag}`)
  return Array.from(new Set(tags)).slice(0, MAX_HASHTAGS)
}

export function buildDefaultPosterCaption(event: PosterCaptionEvent): string {
  const when = formatEventDate(event.date)
  const languages = (event.languages || []).filter(Boolean).slice(0, 3)
  const lines: string[] = []

  lines.push(`🎤 ${event.title || 'Upcoming Event'}`)
  if (when) lines.push(`📅 ${when}`)
  if (event.location) lines.push(`📍 ${event.location}`)
  if (event.theme) lines.push(`🎨 Theme: ${event.theme}`)
  if (languages.length > 0) lines.push(`🗣️ ${languages.join(' · ')}`)

  if (event.tickets_enabled) {
    lines.push(event.external_event ? '🎟️ Tickets available via external link.' : '🎟️ Tickets are available now.')
  } else if (typeof event.credits_required === 'number') {
    lines.push(`💳 ${Math.max(0, event.credits_required)} credit${event.credits_required === 1 ? '' : 's'} to join.`)
  }

  lines.push('')
  lines.push('Save the date and tag someone who should come with you 🙌')
  lines.push(pickHashtags(event).join(' '))

  return sanitizePosterCaption(lines.join('\n')) || '🎤 Upcoming Event\n\n#LiveEvent'
}

export function sanitizePosterCaption(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  let text = input
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!text) return null

  // Keep hashtags tidy (no more than MAX_HASHTAGS).
  let hashtagCount = 0
  const tokens = text.split(/\s+/).map((token) => {
    if (!token.startsWith('#')) return token
    hashtagCount += 1
    return hashtagCount <= MAX_HASHTAGS ? token : ''
  })
  text = tokens.filter(Boolean).join(' ').replace(/\s+\n/g, '\n').trim()

  if (text.length <= MAX_CAPTION_CHARS) return text

  // Prefer cutting at the previous paragraph boundary for cleaner captions.
  const hardCut = text.slice(0, MAX_CAPTION_CHARS)
  const paragraphCut = hardCut.lastIndexOf('\n')
  if (paragraphCut >= 240) {
    return hardCut.slice(0, paragraphCut).trim()
  }
  return hardCut.trim()
}
