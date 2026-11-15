import { createHash } from 'crypto'
import { z } from 'zod'
import { contactInputSchema } from '@/lib/crm'
import { createContact, findDuplicate, updateContact } from '@/lib/server/crm'
import {
  sendLeadWelcomeEmail,
  sendLeadWelcomeSms,
} from '@/lib/server/facebookLeadMessaging'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

const consentValue = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((value) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1
    return ['true', 'yes', 'y', '1', 'consented', 'opted_in'].includes(value.trim().toLowerCase())
  })

export const facebookLeadSchema = z.object({
  leadId: z.string().trim().max(200).optional(),
  createdTime: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  campaignName: z.string().trim().max(300).optional().nullable(),
  adName: z.string().trim().max(300).optional().nullable(),
  consent: consentValue.default(false),
})

export type FacebookLeadInput = z.input<typeof facebookLeadSchema>
type DeliveryStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped_missing'
  | 'skipped_no_consent'
  | 'skipped_opted_out'

function leadKey(input: z.output<typeof facebookLeadSchema>): string {
  if (input.leadId) return input.leadId
  return createHash('sha256')
    .update([input.email || '', input.phone || '', input.createdTime || '', input.name].join('|'))
    .digest('hex')
}

function shortError(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, 1000)
}

export async function processFacebookLead(rawLead: unknown) {
  const db = getAdminClient()
  const ownerId = process.env.FACEBOOK_LEADS_CRM_OWNER_ID
  if (!db || !ownerId) {
    throw new Error('Supabase or FACEBOOK_LEADS_CRM_OWNER_ID is not configured')
  }

  const lead = facebookLeadSchema.parse(rawLead)
  const externalId = leadKey(lead)

  // Recognize rows processed by the original Sheet-only version so enabling
  // Meta's webhook cannot welcome those people a second time.
  const { data: existingDelivery, error: lookupError } = await db
    .from('facebook_lead_deliveries')
    .select('*')
    .eq('external_id', externalId)
    .in('source', ['facebook', 'facebook_google_sheet'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (lookupError) throw lookupError
  let delivery = existingDelivery

  if (!delivery) {
    const { error: insertError } = await db.from('facebook_lead_deliveries').insert({
      source: 'facebook',
      external_id: externalId,
      email_status: 'pending',
      sms_status: 'pending',
    })
    if (insertError && insertError.code !== '23505') throw insertError

    const result = await db
      .from('facebook_lead_deliveries')
      .select('*')
      .eq('source', 'facebook')
      .eq('external_id', externalId)
      .single()
    if (result.error) throw result.error
    delivery = result.data
  }

  let crmStatus = delivery.crm_contact_id ? 'existing' : 'pending'
  let crmContactId: string | null = delivery.crm_contact_id
  let crmError: string | null = null

  if (!crmContactId) {
    try {
      const input = contactInputSchema.parse({
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        how_met: lead.campaignName || lead.adName || 'Facebook lead ad',
        notes:
          [lead.campaignName && `Campaign: ${lead.campaignName}`, lead.adName && `Ad: ${lead.adName}`]
            .filter(Boolean)
            .join('\n') || null,
        ok_to_contact: lead.consent,
        tags: ['Facebook Lead'],
      })
      const duplicate = await findDuplicate(db, ownerId, input)
      const contact = duplicate
        ? await updateContact(db, ownerId, duplicate.id, {
            ok_to_contact: duplicate.ok_to_contact || lead.consent,
            tags: Array.from(new Set([...duplicate.tags.map((tag) => tag.name), 'Facebook Lead'])),
          })
        : await createContact(db, ownerId, input)
      crmContactId = contact.id
      crmStatus = duplicate ? 'existing' : 'imported'
      await db
        .from('facebook_lead_deliveries')
        .update({ crm_contact_id: contact.id })
        .eq('id', delivery.id)
    } catch (error) {
      crmStatus = 'failed'
      crmError = shortError(error instanceof Error ? error.message : 'CRM import failed')
    }
  }

  let emailStatus = delivery.email_status as DeliveryStatus
  let emailSentAt: string | null = delivery.email_sent_at
  let emailError: string | null = null
  if (emailStatus !== 'sent') {
    if (!lead.consent) {
      emailStatus = 'skipped_no_consent'
    } else if (!lead.email) {
      emailStatus = 'skipped_missing'
    } else {
      const result = await sendLeadWelcomeEmail({
        email: lead.email,
        name: lead.name,
        idempotencyKey: `facebook-lead-email-${delivery.id}`,
      })
      if (result.ok) {
        emailStatus = 'sent'
        emailSentAt = new Date().toISOString()
      } else {
        emailStatus = 'failed'
        emailError = shortError(result.error)
      }
    }
    await db
      .from('facebook_lead_deliveries')
      .update({
        email_status: emailStatus,
        email_sent_at: emailSentAt,
        email_error: emailError,
      })
      .eq('id', delivery.id)
  }

  let smsStatus = delivery.sms_status as DeliveryStatus
  let smsSentAt: string | null = delivery.sms_sent_at
  let smsError: string | null = null
  if (smsStatus !== 'sent') {
    if (!lead.consent) {
      smsStatus = 'skipped_no_consent'
    } else if (!lead.phone) {
      smsStatus = 'skipped_missing'
    } else {
      const parsed = contactInputSchema.safeParse({
        name: lead.name,
        phone: lead.phone,
        ok_to_contact: true,
        tags: [],
      })
      if (!parsed.success || !parsed.data.phone) {
        smsStatus = 'failed'
        smsError = 'Phone number is invalid'
      } else {
        const { data: suppression, error: suppressionError } = await db
          .from('sms_suppressions')
          .select('opted_out')
          .eq('phone', parsed.data.phone)
          .maybeSingle()
        if (suppressionError) throw suppressionError

        if (suppression?.opted_out) {
          smsStatus = 'skipped_opted_out'
        } else {
          const result = await sendLeadWelcomeSms({
            phone: parsed.data.phone,
            name: lead.name,
            idempotencyKey: `facebook-lead-sms-${delivery.id}`,
          })
          if (result.ok) {
            smsStatus = 'sent'
            smsSentAt = new Date().toISOString()
          } else {
            smsStatus = 'failed'
            smsError = shortError(result.error)
          }
        }
      }
    }
    await db
      .from('facebook_lead_deliveries')
      .update({
        sms_status: smsStatus,
        sms_sent_at: smsSentAt,
        sms_error: smsError,
        processed_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
  }

  return {
    leadId: externalId,
    crmStatus,
    crmContactId,
    emailStatus,
    emailSentAt,
    smsStatus,
    smsSentAt,
    error: [crmError, emailError, smsError].filter(Boolean).join(' | ') || null,
    processedAt: new Date().toISOString(),
  }
}
