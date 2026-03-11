'use server'

import { supabase } from '@/lib/supabase'

export async function addCreditsToUser(
  userId: string,
  amount: number,
  adminId: string,
  notes?: string
) {
  try {
    // Get current credits
    const { data: user, error: fetchError } = await supabase
      .from('profiles')
      .select('credits, credits_complimentary')
      .eq('id', userId)
      .single()

    if (fetchError) throw fetchError

    const nextCredits = (user.credits || 0) + amount
    const nextComplimentary = (user.credits_complimentary ?? 0) + amount

    // Update credits
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        credits: nextCredits,
        credits_complimentary: nextComplimentary,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (updateError) throw updateError

    // Log transaction (manual add = complimentary)
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: amount,
      transaction_type: 'manual_add',
      notes: notes || `Manual credit adjustment by admin`,
      created_by: adminId,
      credit_source: 'in_kind',
    })

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createEvent(eventData: {
  title: string
  description: string
  date: string
  location: string
  credits_required: number
  max_attendees?: number
}) {
  try {
    const { data, error } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteEvent(eventId: string) {
  try {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (error) throw error

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}