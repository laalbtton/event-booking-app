'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  // Email/password signup
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      if (error) throw error

      // Check if email confirmation is required
      // If user is null or email is not confirmed, they need to verify their email
      if (!data.user || !data.user.email_confirmed_at) {
        setSuccess(true)
        // Don't redirect - show email verification message instead
        return
      }

      // If email is already confirmed (shouldn't happen normally, but handle it)
      setSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  // Google OAuth signup
  async function handleGoogleSignup() {
    setError('')
    setLoading(true)

    try {
      // Ensure we use the current origin (localhost or production)
      const redirectUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/auth/callback`
        : '/auth/callback'
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            redirect_to: redirectUrl,
          },
        },
      })

      if (error) throw error
    } catch (error: any) {
      setError(error.message)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-blue-600 text-6xl mb-4">📧</div>
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Check Your Email!</h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-gray-700 mb-3">
              We've sent a verification email to <strong>{email}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-3">
              Please click the link in the email to verify your account before you can access the dashboard.
            </p>
            <p className="text-sm text-gray-600">
              Once verified, you can log in and start booking events!
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Didn't receive the email? Check your spam folder or try signing up again.
            </p>
            <Link
              href="/login"
              className="inline-block w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold text-base shadow-md transition-colors"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-900">Sign Up</h1>
        <p className="text-center text-gray-600 mb-6">Create your account</p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Google Signup Button */}
        <button
          onClick={handleGoogleSignup}
          disabled={loading}
          className="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 font-semibold text-base shadow-sm mb-4 flex items-center justify-center gap-3 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'Signing up...' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or sign up with email</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-900">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="John Smith"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-900">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-900">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="••••••••"
              required
              minLength={6}
            />
            <p className="text-xs text-gray-600 mt-1">At least 6 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold text-base shadow-md transition-colors"
          >
            {loading ? 'Creating account...' : 'Sign Up with Email'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-gray-700">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:text-blue-800 font-semibold underline">
            Login
          </Link>
        </p>

        {/* Terms */}
        <p className="text-center mt-4 text-xs text-gray-500">
          By signing up, you agree to our{' '}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  )
}