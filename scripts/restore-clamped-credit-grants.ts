/**
 * Restores complimentary grants that the first version of
 * sql/credit_balance_integrity_migration.sql zeroed by mistake.
 *
 * That migration's step 2 was scoped with `credits <= 0`. It was meant to clean up
 * the profiles whose balance had just been written off from negative, but `<= 0`
 * also matched profiles sitting at exactly 0 that held a real complimentary grant
 * which had never landed in `credits` — so the grant was wiped instead of honoured.
 *
 * Each affected profile is restored to its credit_transactions total, which is the
 * record of what was actually granted, and the restore is itself logged.
 *
 * Report-only by default; pass --apply to write.
 *
 *   npx tsx scripts/restore-clamped-credit-grants.ts
 *   npx tsx scripts/restore-clamped-credit-grants.ts --apply
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

const apply = process.argv.includes('--apply')

// Profiles zeroed by the bad clamp, identified before the fix was applied.
// Balance is rebuilt from the ledger rather than from these numbers.
const AFFECTED = [
  { id: '2876d0e8-c56a-4830-a7f7-4a59623ce327', name: 'Khadija', priorComplimentary: 45 },
  { id: 'e32c94da-daea-4f4f-b9ff-df342e8b617c', name: 'Shagun Chheda', priorComplimentary: 45 },
  { id: 'b8260389-9bf1-4548-a27a-591675a53b29', name: 'Jadyn Avo', priorComplimentary: 5 },
]

async function main() {
  for (const target of AFFECTED) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, credits_purchased, credits_complimentary')
      .eq('id', target.id)
      .maybeSingle()

    if (profileError || !profile) {
      console.log(`${target.name}: profile not found (${profileError?.message ?? 'missing'})`)
      continue
    }

    const { data: txs, error: txError } = await supabase
      .from('credit_transactions')
      .select('amount, transaction_type')
      .eq('user_id', target.id)
    if (txError) {
      console.log(`${target.name}: could not read ledger (${txError.message})`)
      continue
    }

    // Venue-credit rows move venue_credit_grants, not profiles.credits, so they
    // must not count toward the profile balance.
    const ledgerTotal = (txs ?? [])
      .filter((t) => !String(t.transaction_type).startsWith('venue_credit'))
      .reduce((acc, t) => acc + Number(t.amount || 0), 0)

    const current = Number(profile.credits || 0)
    const purchased = Math.max(0, Number(profile.credits_purchased) || 0)
    const target_ = Math.max(0, ledgerTotal)
    const delta = target_ - current

    console.log(
      `${target.name.padEnd(15)} credits=${current} comp=${profile.credits_complimentary}` +
        `  ledgerTotal=${ledgerTotal}  ->  restore to ${target_} (delta ${delta >= 0 ? '+' : ''}${delta})`,
    )

    if (!apply) continue
    if (delta === 0) {
      console.log('  already correct, skipping')
      continue
    }
    if (delta < 0) {
      console.log('  ledger is BELOW current balance — skipping rather than removing credits')
      continue
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        credits: target_,
        credits_purchased: Math.min(purchased, target_),
        credits_complimentary: target_ - Math.min(purchased, target_),
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id)
    if (updateError) {
      console.log(`  FAIL: ${updateError.message}`)
      continue
    }

    await supabase.from('credit_transactions').insert({
      user_id: target.id,
      amount: delta,
      transaction_type: 'balance_correction',
      notes: `Restored complimentary grant zeroed by credit_balance_integrity migration (+${delta})`,
    })
    console.log(`  restored: credits ${current} -> ${target_}`)
  }

  if (!apply) console.log('\nReport only. Re-run with --apply to restore.')
}

void main()
