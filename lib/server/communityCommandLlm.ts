/**
 * LLM extraction for Community Command Assistant (assign_hosts v1).
 * Requires OPENAI_API_KEY. Returns structured JSON only.
 */

import OpenAI from 'openai'
import type { ExtractedHostAssignment } from '@/lib/server/communityCommands'

export function getMissingOpenAiConfig(): string[] {
  const missing: string[] = []
  if (!process.env.OPENAI_API_KEY?.trim()) missing.push('OPENAI_API_KEY')
  return missing
}

type LlmExtractResult =
  | { ok: true; assignments: ExtractedHostAssignment[] }
  | { ok: false; error: string }

const SYSTEM = `You extract host-assignment instructions from admin notes for a comedy/events app.
Return ONLY valid JSON with this shape:
{"assignments":[{"dateHint":"string","hostNameHint":"string","eventTitleHint":"string|null"}]}

Rules:
- dateHint: keep the date as written (e.g. "Wed Mar 4", "2026-03-04", "March 4").
- hostNameHint: the person's name to assign as host.
- eventTitleHint: optional event title/venue keyword if present; otherwise null.
- Ignore lines that are not assignment instructions.
- If the user gives a list of "date — name" pairs, emit one assignment per pair.
- Do not invent names or dates that are not in the input.`

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
      const eventTitleHint =
        typeof row.eventTitleHint === 'string' && row.eventTitleHint.trim()
          ? row.eventTitleHint.trim()
          : null
      assignments.push({ dateHint, hostNameHint, eventTitleHint })
    }

    if (assignments.length === 0) {
      return {
        ok: false,
        error: 'No host assignments found in the prompt. Try lines like "Wed Mar 4 — Jas".',
      }
    }

    return { ok: true, assignments }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[communityCommandLlm] extract failed:', err)
    return { ok: false, error: `OpenAI request failed: ${message}` }
  }
}
