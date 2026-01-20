'use client'

import { useState } from 'react'

type ToastType = 'success' | 'info' | 'warning' | 'error'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-md pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`p-4 rounded-lg shadow-xl flex items-start gap-3 pointer-events-auto transform transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-green-500 border-2 border-green-600 text-white'
              : toast.type === 'error'
              ? 'bg-red-500 border-2 border-red-600 text-white'
              : toast.type === 'warning'
              ? 'bg-yellow-500 border-2 border-yellow-600 text-white'
              : 'bg-blue-500 border-2 border-blue-600 text-white'
          }`}
        >
          <div className="flex-1">
            <p className="font-semibold text-sm">{toast.message}</p>
          </div>
          <button
            onClick={() => onRemove(toast.id)}
            className="text-white hover:text-gray-200 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(7)
    setToasts((prev) => [...prev, { id, message, type }])
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return { toasts, showToast, removeToast }
}
