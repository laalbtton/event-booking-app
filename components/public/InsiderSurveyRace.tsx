import type { InsiderSurveyStats, SurveyBucket } from '@/lib/server/insiderSurveyStats'

const CITY_COLORS = ['#facc15', '#fb923c', '#22d3ee', '#a78bfa', '#fb7185', '#4ade80', '#60a5fa']
const AGE_COLORS = ['#f472b6', '#facc15', '#38bdf8', '#c084fc', '#34d399', '#f97316']

function pieGradient(buckets: SurveyBucket[], colors: string[]): string {
  if (buckets.length === 0) return '#27272a'
  let cursor = 0
  const stops: string[] = []
  buckets.forEach((bucket, i) => {
    const next = cursor + bucket.pct
    stops.push(`${colors[i % colors.length]} ${cursor}% ${next}%`)
    cursor = next
  })
  if (cursor < 100) stops.push(`#27272a ${cursor}% 100%`)
  return `conic-gradient(${stops.join(', ')})`
}

function RaceCard({
  title,
  subtitle,
  winnerLabel,
  winnerCopy,
  buckets,
  colors,
  emptyCopy,
}: {
  title: string
  subtitle: string
  winnerLabel: string | null
  winnerCopy: string
  buckets: SurveyBucket[]
  colors: string[]
  emptyCopy: string
}) {
  const winner = buckets[0]
  const max = winner?.count || 1
  const tiedLabels = winner ? buckets.filter((b) => b.count === winner.count).map((b) => b.label) : []
  const isTied = tiedLabels.length > 1
  const displayWinner = isTied ? tiedLabels.join(' & ') : winnerLabel
  const displayCopy = isTied
    ? `${tiedLabels.join(' & ')} are tied`
    : winnerCopy

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-yellow-300">{title}</p>
      <p className="mt-1 text-sm text-stone-400">{subtitle}</p>

      {buckets.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">{emptyCopy}</p>
      ) : (
        <>
          <div className="mt-5 flex items-center gap-5">
            <div
              className="relative h-28 w-28 shrink-0 rounded-full"
              style={{ background: pieGradient(buckets, colors) }}
              aria-hidden
            >
              <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-zinc-950 text-center">
                <span className="text-[10px] uppercase tracking-wider text-stone-500">Lead</span>
                <span className="px-1 text-xs font-bold leading-tight text-yellow-300 line-clamp-2">
                  {displayWinner}
                </span>
              </div>
            </div>
            <div>
              <p className="text-lg font-extrabold text-white">{displayCopy}</p>
              {winner && (
                <p className="mt-1 text-sm text-stone-400">
                  {winner.count} {winner.count === 1 ? 'response' : 'responses'}
                  {isTied ? ' each' : ` · ${winner.pct}%`}
                </p>
              )}
            </div>
          </div>

          <ul className="mt-6 space-y-3">
            {buckets.map((bucket, i) => {
              const isWinner = tiedLabels.includes(bucket.label)
              const width = Math.max(8, Math.round((bucket.count / max) * 100))
              return (
                <li key={bucket.label}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className={`font-medium ${isWinner ? 'text-yellow-300' : 'text-stone-200'}`}>
                      {isWinner ? '🏆 ' : ''}
                      {bucket.label}
                    </span>
                    <span className="tabular-nums text-stone-400">
                      {bucket.count} · {bucket.pct}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${width}%`, backgroundColor: colors[i % colors.length] }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

export function InsiderSurveyRace({ stats }: { stats: InsiderSurveyStats }) {
  if (stats.cityResponses === 0 && stats.ageResponses === 0) {
    return (
      <section className="px-4 pt-10 pb-4">
        <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-stone-300">Who’s showing up so far</p>
          <p className="mt-2 text-sm text-stone-500">
            City and age breakdowns will appear here as people fill out the survey.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="px-4 pt-10 pb-4">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-2xl font-bold text-white">Who’s showing up so far</h2>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-stone-400">
          Live from Insider survey answers. {stats.responses} {stats.responses === 1 ? 'member' : 'members'} in so far.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RaceCard
            title="City race"
            subtitle="Where people are coming from"
            winnerLabel={stats.winningCity}
            winnerCopy={
              stats.winningCity ? `${stats.winningCity} is winning` : 'No city lead yet'
            }
            buckets={stats.cities}
            colors={CITY_COLORS}
            emptyCopy="City answers will show here after the first survey."
          />
          <RaceCard
            title="Age race"
            subtitle="Which age group is filling the room"
            winnerLabel={stats.winningAge}
            winnerCopy={
              stats.winningAge ? `${stats.winningAge} is winning` : 'No age lead yet'
            }
            buckets={stats.ages}
            colors={AGE_COLORS}
            emptyCopy="Age answers will show here after the first survey."
          />
        </div>
      </div>
    </section>
  )
}
