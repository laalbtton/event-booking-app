'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ConfirmDialogOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null)

type PendingConfirmation = {
  options: ConfirmDialogOptions
  resolve: (value: boolean) => void
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null)

  const closeWithResult = useCallback((value: boolean) => {
    setPending((current) => {
      if (!current) return null
      current.resolve(value)
      return null
    })
  }, [])

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve })
    })
  }, [])

  useEffect(() => {
    return () => {
      if (pending) {
        pending.resolve(false)
      }
    }
  }, [pending])

  const value = useMemo(() => ({ confirm }), [confirm])
  const options = pending?.options

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <Dialog open={!!pending} onOpenChange={(open) => !open && closeWithResult(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{options?.title || 'Please confirm'}</DialogTitle>
            <DialogDescription className="whitespace-pre-line text-sm leading-6">
              {options?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => closeWithResult(false)}
            >
              {options?.cancelText || 'Cancel'}
            </Button>
            <Button
              type="button"
              variant={options?.variant || 'default'}
              onClick={() => closeWithResult(true)}
            >
              {options?.confirmText || 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext)
  if (!context) {
    throw new Error('useConfirmDialog must be used within ConfirmDialogProvider')
  }
  return context
}
