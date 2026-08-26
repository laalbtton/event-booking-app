/**
 * Credit ledger reconciliation.
 *
 * `profiles.credits` is the authoritative balance; credits_purchased and
 * credits_complimentary only record how it was funded. When the split totals more
 * than `credits`, the difference used to read as spendable credit that no balance
 * backed (see lib/creditLedger.ts). That is fixed in code, which means any profile
 * still carrying that drift now has a *lower* spendable balance than before —
 * including members who were granted credits that never landed in `credits`.
 *
 * Report-only by default. Pass --apply with a mode to repair:
 *
 *   npx tsx scripts/reconcile-credit-ledger.ts
 *   npx tsx scripts/reconcile-credit-ledger.ts --apply --mode=honour-grants
 *   npx tsx scripts/reconcile-credit-ledger.ts --apply --mode=trust-balance --user=<uuid>
 *
 *   honour-grants  raise `credits` to match the split (member keeps the grant)
 *   trust-balance  clamp the split down to `credits` (treat the split as stale)
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const mode = (args.find((a) => a.startsWith('--mode='))?.split('=')[1] ?? '') as
  | 'honour-grants'
  | 'trust-balance'
  | ''
const onlyUser = args.find((a) => a.startsWith('--user='))?.split('=')[1] ?? null

type Row = {
  id: string
  full_name: string | null
  email: string | null
  credits: number | null
  credits_purchased: number | null
  credits_complimentary: number | null
}

const n = (v: number | null | undefined) => Math.max(0, Number(v) || 0)

async function fetchAll(): Promise<Row[]> {
  const out: Row[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, credits, credits_purchased, credits_complimentary')
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function main() {
  const all = await fetchAll()

  const negative = all.filter((r) => Number(r.credits) < 0)
  const overstated = all
    .filter((r) => n(r.credits_purchased) + n(r.credits_complimentary) > n(r.credits))
    .filter((r) => !onlyUser || r.id === onlyUser)

  console.log(`Scanned ${all.length} profiles\n`)

  console.log(`Negative balances: ${negative.length}`)
  for (const r of negative) {
    console.log(`  ${r.credits}  ${r.full_name ?? '-'} <${r.email ?? '-'}>  (${r.id})`)
  }

  console.log(`\nSplit overstates balance: ${overstated.length}`)
  let totalGap = 0
  for (const r of overstated.sort(
    (a, b) =>
      n(b.credits_purchased) + n(b.credits_complimentary) - n(b.credits) -
      (n(a.credits_purchased) + n(a.credits_complimentary) - n(a.credits)),
  )) {
    const gap = n(r.credits_purchased) + n(r.credits_complimentary) - n(r.credits)
    totalGap += gap
    console.log(
      `  gap=${String(gap).padStart(4)}  credits=${String(r.credits).padStart(4)}` +
        `  purch=${String(r.credits_purchased).padStart(4)} comp=${String(r.credits_complimentary).padStart(4)}` +
        `  ${r.full_name ?? '-'} <${r.email ?? '-'}>  (${r.id})`,
    )
  }
  console.log(`\nTotal drift: ${totalGap} credits`)

  if (!apply) {
    console.log('\nReport only. Re-run with --apply --mode=honour-grants|trust-balance to repair.')
    return
  }
  if (mode !== 'honour-grants' && mode !== 'trust-balance') {
    console.log('\n--apply requires --mode=honour-grants or --mode=trust-balance')
    process.exitCode = 1
    return
  }

  for (const r of overstated) {
    const splitTotal = n(r.credits_purchased) + n(r.credits_complimentary)
    const gap = splitTotal - n(r.credits)

    if (mode === 'honour-grants') {
      const { error } = await supabase
        .from('profiles')
        .update({ credits: splitTotal, updated_at: new Date().toISOString() })
        .eq('id', r.id)
      if (error) {
        console.log(`  FAIL ${r.id}: ${error.message}`)
        continue
      }
      await supabase.from('credit_transactions').insert({
        user_id: r.id,
        amount: gap,
        transaction_type: 'balance_correction',
        notes: `Ledger reconciliation: credits raised to match granted split (+${gap})`,
      })
      console.log(`  honoured ${r.id}: credits ${r.credits} -> ${splitTotal}`)
    } else {
      const purchased = Math.min(n(r.credits_purchased), n(r.credits))
      const { error } = await supabase
        .from('profiles')
        .update({
          credits_purchased: purchased,
          credits_complimentary: n(r.credits) - purchased,
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.id)
      if (error) {
        console.log(`  FAIL ${r.id}: ${error.message}`)
        continue
      }
      console.log(`  clamped ${r.id}: split ${splitTotal} -> ${n(r.credits)}`)
    }
  }
}

void main()
