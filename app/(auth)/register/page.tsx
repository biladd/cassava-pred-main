'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess('Akun berhasil dibuat! Mengarahkan ke login...')
    setTimeout(() => { window.location.href = '/login' }, 1500)
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Register</h1>
      <p className="text-sm text-slate-500 mb-6">Create a new account to access the dashboard</p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          ✅ {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1.5">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border-2 border-slate-300 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10 outline-none transition text-slate-900 text-sm placeholder:text-slate-400 bg-slate-50"
            placeholder="kamu@email.com"
            disabled={loading}
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 pr-12 rounded-lg border-2 border-slate-300 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10 outline-none transition text-slate-900 text-sm placeholder:text-slate-400 bg-slate-50"
              placeholder="••••••••"
              disabled={loading}
              minLength={6}
            />
            <button
              type="button"
              onMouseDown={() => setShowPass(true)}
              onMouseUp={() => setShowPass(false)}
              onMouseLeave={() => setShowPass(false)}
              onTouchStart={() => setShowPass(true)}
              onTouchEnd={() => setShowPass(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1"
              tabIndex={-1}
            >
              {showPass ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">Minimum 6 characters</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-slate-700 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg transition text-sm"
        >
          {loading ? 'Memproses...' : 'Register'}
        </button>
      </form>

      <p className="text-sm text-center text-slate-600 mt-6">
        already have account?{' '}
        <Link href="/login" className="text-slate-900 font-semibold hover:underline">
          Login 
        </Link>
      </p>
    </div>
  )
}