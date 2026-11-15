import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { processFacebookLead, type FacebookLeadInput } from '@/lib/server/processFacebookLead'

export const dynamic = 'force-dynamic'

type MetaChange = {
  field?: string
  value?: {
    leadgen_id?: string
    form_id?: string
    page_id?: string
    ad_id?: string
    created_time?: number
  }
}

type MetaWebhookBody = {
  object?: string
  entry?: Array<{ changes?: MetaChange[] }>
}

type MetaLead = {
  id: string
  created_time?: string
  ad_name?: string
  campaign_name?: string
  field_data?: Array<{ name: string; values?: string[] }>
}

function safeEqual(left: string | null, right: string | undefined): boolean {
  if (!left || !right) return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Meta calls this when "Verify and save" is clicked in the developer dashboard. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (
    mode === 'subscribe' &&
    challenge &&
    safeEqual(token, process.env.META_WEBHOOK_VERIFY_TOKEN)
  ) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Webhook verification failed' }, { status: 403 })
}

function validMetaSignature(rawBody: string, signature: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret || !signature?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  return safeEqual(signature, expected)
}

function normalizeFieldName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function fieldsByName(lead: MetaLead): Map<string, string> {
  return new Map(
    (lead.field_data || []).map((field) => [
      normalizeFieldName(field.name),
      (field.values || []).join(', ').trim(),
    ]),
  )
}

function firstField(fields: Map<string, string>, names: string[]): string | null {
  for (const name of names) {
    const value = fields.get(normalizeFieldName(name))
    if (value) return value
  }
  return null
}

function hasConsent(fields: Map<string, string>): boolean {
  const configured = (process.env.META_LEAD_CONSENT_FIELDS ||
    'consent,contact_consent,marketing_consent,email_sms_consent,permission_to_contact')
    .split(',')
    .map(normalizeFieldName)
  const answer = firstField(fields, configured)?.trim().toLowerCase()
  if (!answer) return false
  return (
    ['true', 'yes', 'y', '1', 'consented', 'opted_in', 'i agree', 'agree', 'agreed'].includes(answer) ||
    answer.startsWith('yes,') ||
    answer.startsWith('yes ')
  )
}

async function fetchMetaLead(leadId: string): Promise<MetaLead> {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN
  if (!accessToken) throw new Error('META_PAGE_ACCESS_TOKEN is not configured')

  const version = process.env.META_GRAPH_API_VERSION || 'v27.0'
  const fields = 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(leadId)}`)
  url.searchParams.set('fields', fields)
  url.searchParams.set('access_token', accessToken)
  const response = await fetch(url, { cache: 'no-store' })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`Meta lead lookup failed (${response.status}): ${JSON.stringify(body)}`)
  }
  return body as MetaLead
}

function toLeadInput(lead: MetaLead): FacebookLeadInput {
  const fields = fieldsByName(lead)
  const firstName = firstField(fields, ['first_name', 'firstname'])
  const lastName = firstField(fields, ['last_name', 'lastname'])
  const email = firstField(fields, ['email', 'email_address'])
  const name =
    firstField(fields, ['full_name', 'name']) ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    email?.split('@')[0] ||
    'Facebook Lead'

  return {
    leadId: lead.id,
    createdTime: lead.created_time,
    name,
    email,
    phone: firstField(fields, ['phone_number', 'phone', 'mobile_number', 'mobile']),
    city: firstField(fields, ['city']),
    campaignName: lead.campaign_name,
    adName: lead.ad_name,
    consent: hasConsent(fields),
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!validMetaSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid Meta signature' }, { status: 401 })
  }

  try {
    const body = JSON.parse(rawBody) as MetaWebhookBody
    if (body.object !== 'page') return NextResponse.json({ received: true, processed: 0 })

    const leadIds = (body.entry || [])
      .flatMap((entry) => entry.changes || [])
      .filter((change) => change.field === 'leadgen')
      .map((change) => change.value?.leadgen_id)
      .filter((id): id is string => Boolean(id))

    for (const leadId of Array.from(new Set(leadIds))) {
      const lead = await fetchMetaLead(leadId)
      await processFacebookLead(toLeadInput(lead))
    }

    return NextResponse.json({ received: true, processed: new Set(leadIds).size })
  } catch (error) {
    console.error('[meta-lead-webhook]', error)
    return NextResponse.json({ error: 'Lead processing failed' }, { status: 500 })
  }
}
