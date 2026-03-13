'use client'

import { useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'

export default function EventQRCodePage() {
  const params = useParams()
  const eventId = params.id as string
  const publicUrl = `${window.location.origin}/events/${eventId}`

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-2xl">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">Event QR Code</h1>
        
        <div className="bg-white p-8 rounded-lg border-4 border-gray-200 inline-block mb-6">
          <QRCodeSVG 
            value={publicUrl} 
            size={300}
            level="H"
            includeMargin={true}
          />
        </div>

        <p className="text-gray-700 mb-4">Scan to view event lineup</p>
        <p className="text-sm text-gray-600 mb-6 break-all">{publicUrl}</p>

        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold"
        >
          🖨️ Print QR Code
        </button>
      </div>
    </div>
  )
}