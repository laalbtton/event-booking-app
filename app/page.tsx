 'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'

export default function Home() {
  const router = useRouter()
  const { authResolved, user } = useAuthBootstrap()

  useEffect(() => {
    if (!authResolved) return
    if (user) {
      router.replace('/dashboard')
    }
  }, [authResolved, user, router])

  if (!authResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 px-4">
        <p className="text-white text-lg">Loading...</p>
      </div>
    )
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 px-4">
        <p className="text-white text-lg">Redirecting...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 px-4">
      <div className="text-center text-white max-w-2xl">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 drop-shadow-lg">Event Booking App</h1>
        <p className="text-xl md:text-2xl mb-8 drop-shadow">Book events with credits</p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/login"
            className="bg-white text-blue-700 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 inline-block text-lg shadow-lg"
          >
            Login
          </Link>
          <Link 
            href="/signup"
            className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-700 inline-block text-lg shadow-lg"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  )
}