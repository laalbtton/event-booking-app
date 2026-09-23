import { AGE_RANGES, CITIES } from '@/lib/foundingMembers'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

export type SurveyBucket = {
  label: string
  count: number
  pct: number
}

export type InsiderSurveyStats = {
  responses: number
  cityResponses: number
  ageResponses: number
  cities: SurveyBucket[]
  ages: SurveyBucket[]
  winningCity: string | null
  winningAge: string | null
}

function emptyStats(): InsiderSurveyStats {
  return {
    responses: 0,
    cityResponses: 0,
    ageResponses: 0,
    cities: [],
    ages: [],
    winningCity: null,
    winningAge: null,
  }
}

function tally(
  values: Array<string | null | undefined>,
  known: readonly string[],
): { buckets: SurveyBucket[]; winning: string | null; total: number } {
  const counts = new Map<string, number>()
  for (const label of known) counts.set(label, 0)

  let total = 0
  for (const raw of values) {
    const value = (raw || '').trim()
    if (!value) continue
    total += 1
    if (counts.has(value)) {
      counts.set(value, (counts.get(value) || 0) + 1)
    } else {
      counts.set('Other', (counts.get('Other') || 0) + 1)
    }
  }

  const buckets = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({
      label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return {
    buckets,
    winning: buckets[0]?.label ?? null,
    total,
  }
}

export async function getInsiderSurveyStats(): Promise<InsiderSurveyStats> {
  const supabase = getAdminClient()
  if (!supabase) return emptyStats()

  const { data, error } = await supabase
    .from('founding_members')
    .select('city, age_range')

  if (error || !data) {
    console.error('[insiderSurveyStats]', error?.message)
    return emptyStats()
  }

  const cityTally = tally(
    data.map((row) => row.city as string | null),
    CITIES,
  )
  const ageTally = tally(
    data.map((row) => row.age_range as string | null),
    AGE_RANGES,
  )

  return {
    responses: data.filter((row) => row.city || row.age_range).length,
    cityResponses: cityTally.total,
    ageResponses: ageTally.total,
    cities: cityTally.buckets,
    ages: ageTally.buckets,
    winningCity: cityTally.winning,
    winningAge: ageTally.winning,
  }
}
