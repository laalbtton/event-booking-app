/**
 * LLM extraction for Community Command Assistant (assign_hosts v1).
 * Requires OPENAI_API_KEY. Returns structured JSON only.
 */

import OpenAI from 'openai'
import {
  normalizeLocationHint,
  type ExtractedHostAssignment,
  type LocationHint,
} from '@/lib/server/communityCommands'

export function getMissingOpenAiConfig(): string[] {
  const missing: string[] = []
  if (!process.env.OPENAI_API_KEY?.trim()) missing.push('OPENAI_API_KEY')
  return missing
}

type LlmExtractResult =
  | { ok: true; assignments: ExtractedHostAssignment[] }
  | { ok: false; error: string }

const SYSTEM = `You extract host-assignment instructions from admin notes for a comedy/events app in the GTA (Brampton + Toronto).
Return ONLY valid JSON with this shape:
{"assignments":[{"dateHint":"string","hostNameHint":"string","locationHint":"brampton"|"toronto"|null,"eventTitleHint":"string|null"}]}

Rules:
- dateHint: keep the calendar date EXACTLY as written (e.g. "Wed Mar 4", "March 4", "2026-03-04"). Do not convert or rewrite the date.
- hostNameHint: the person's name to assign as host.
- locationHint: "brampton" or "toronto" when the line mentions city/mic location (Brampton, Toronto, Ryan's Chai, SoCap, etc.); otherwise null.
- eventTitleHint: optional event title keyword if present and NOT just the city name; otherwise null.
- Ignore lines that are not assignment instructions.
- If the user gives a list of "date — name" or "date — Brampton — name" pairs, emit one assignment per pair.
- Do not invent names, dates, or cities that are not in the input.`

export async function extractHostAssignmentsFromPrompt(prompt: string): Promise<LlmExtractResult> {
  const missing = getMissingOpenAiConfig()
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required env var(s): ${missing.join(', ')}. Set OPENAI_API_KEY in Vercel and redeploy.`,
    }
  }

  const trimmed = prompt.trim()
  if (!trimmed) {
    return { ok: false, error: 'Prompt is empty.' }
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim() })
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Extract host assignments from this admin prompt:\n\n${trimmed}`,
        },
      ],
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return { ok: false, error: 'OpenAI returned an empty response.' }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return { ok: false, error: 'OpenAI returned invalid JSON.' }
    }

    const assignmentsRaw = (parsed as { assignments?: unknown })?.assignments
    if (!Array.isArray(assignmentsRaw)) {
      return { ok: false, error: 'OpenAI JSON missing assignments array.' }
    }

    const assignments: ExtractedHostAssignment[] = []
    for (const item of assignmentsRaw) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const dateHint = typeof row.dateHint === 'string' ? row.dateHint.trim() : ''
      const hostNameHint = typeof row.hostNameHint === 'string' ? row.hostNameHint.trim() : ''
      if (!dateHint || !hostNameHint) continue

      let eventTitleHint =
        typeof row.eventTitleHint === 'string' && row.eventTitleHint.trim()
          ? row.eventTitleHint.trim()
          : null

      let locationHint: LocationHint | null =
        normalizeLocationHint(typeof row.locationHint === 'string' ? row.locationHint : null) ||
        normalizeLocationHint(eventTitleHint)

      // If the only "title" was a city/venue alias, treat it as location only
      if (eventTitleHint && normalizeLocationHint(eventTitleHint) && !row.locationHint) {
        eventTitleHint = null
      }

      // Also scan the raw date+name line leftovers via host/title for city words
      if (!locationHint) {
        locationHint = normalizeLocationHint(`${dateHint} ${hostNameHint} ${eventTitleHint || ''}`)
      }

      assignments.push({ dateHint, hostNameHint, eventTitleHint, locationHint })
    }

    // Deterministic fallback: if LLM missed location, scan each original line for Brampton/Toronto
    const enriched = enrichLocationFromPromptLines(trimmed, assignments)

    if (enriched.length === 0) {
      return {
        ok: false,
        error: 'No host assignments found in the prompt. Try lines like "Wed Mar 4 — Brampton — Jas".',
      }
    }

    return { ok: true, assignments: enriched }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[communityCommandLlm] extract failed:', err)
    return { ok: false, error: `OpenAI request failed: ${message}` }
  }
}

/** Best-effort: if a prompt line mentions Brampton/Toronto near a host, attach locationHint. */
function enrichLocationFromPromptLines(
  prompt: string,
  assignments: ExtractedHostAssignment[],
): ExtractedHostAssignment[] {
  const lines = prompt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return assignments.map((a) => {
    if (a.locationHint) return a
    const host = a.hostNameHint.toLowerCase()
    const date = a.dateHint.toLowerCase()
    const matchLine = lines.find((line) => {
      const l = line.toLowerCase()
      return l.includes(host) && (l.includes(date.split(/\s+/).slice(-2).join(' ')) || l.includes(date))
    })
    const fromLine = normalizeLocationHint(matchLine || '')
    if (fromLine) return { ...a, locationHint: fromLine }
    return a
  })
}
