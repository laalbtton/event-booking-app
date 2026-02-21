'use client'

import { useEffect } from 'react'
import { Toaster, toast } from 'sonner'

function classifyAlert(message: string): 'success' | 'error' | 'info' {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('error') ||
    normalized.includes('failed') ||
    normalized.includes('invalid') ||
    normalized.includes('not authenticated') ||
    normalized.includes('insufficient') ||
    normalized.includes('cannot')
  ) {
    return 'error'
  }

  if (
    normalized.includes('success') ||
    normalized.includes('saved') ||
    normalized.includes('updated') ||
    normalized.includes('copied') ||
    normalized.includes('connected') ||
    normalized.includes('queued') ||
    normalized.includes('booked') ||
    normalized.includes('cancelled')
  ) {
    return 'success'
  }

  return 'info'
}

export function GlobalAlertsProvider() {
  useEffect(() => {
    const originalAlert = window.alert

    window.alert = (message?: unknown) => {
      const text = typeof message === 'string' ? message : String(message ?? '')
      const kind = classifyAlert(text)

      if (kind === 'error') {
        toast.error(text)
      } else if (kind === 'success') {
        toast.success(text)
      } else {
        toast.message(text)
      }
    }

    return () => {
      window.alert = originalAlert
    }
  }, [])

  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        className: 'text-sm',
        duration: 4500,
      }}
    />
  )
}
