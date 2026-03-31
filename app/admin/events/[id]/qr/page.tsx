'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'

export default function EventQRCodePage() {
  const params = useParams()
  const eventId = params.id as string
  const [publicUrl, setPublicUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && eventId) {
      setPublicUrl(`${window.location.origin}/events/${eventId}`)
    }
  }, [eventId])

  function handleDownloadQr() {
    const svg = document.querySelector('#admin-event-qr svg') as SVGElement | null
    if (!svg) {
      toast.error('QR code not ready yet')
      return
    }
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svg)
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `event-${eventId}-qr.svg`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-2xl">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">Event QR Code</h1>
        
        <div id="admin-event-qr" className="bg-white p-8 rounded-lg border-4 border-gray-200 inline-block mb-6">
          <QRCodeSVG 
            value={publicUrl} 
            size={300}
            level="H"
            includeMargin={true}
          />
        </div>

        <p className="text-gray-700 mb-4">Scan to view event lineup</p>
        <p className="text-sm text-gray-600 mb-6 break-all">{publicUrl}</p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={handleDownloadQr}
            className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 font-semibold"
          >
            ⬇️ Download QR Code
          </button>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold"
          >
            🖨️ Print QR Code
          </button>
        </div>
      </div>
    </div>
  )
}