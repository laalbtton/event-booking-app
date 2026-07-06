'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { label: 'Events', href: '/laalbutton#events' },
  { label: 'Punjabis in Tech', href: '/laalbutton/punjabis-in-tech' },
  { label: 'Multilingual Comedy', href: '/laalbutton/multilingual-comedy' },
  { label: 'Roti Kapda Aur Comedy', href: '/laalbutton/roti-kapda-aur-comedy' },
  { label: 'Satrang', href: 'https://satrang.ca', external: true },
]

export function LBHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) =>
    href.startsWith('/laalbutton') && pathname === href.split('#')[0]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#2a1a0e] bg-[#0d0a07]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        {/* Logo */}
        <Link href="/laalbutton" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/laalbutton-logo-white.png"
            alt="Laal Button Comedy"
            className="h-9 w-auto object-contain"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-sm font-medium text-[#c8a882] hover:text-[#f5a623] transition-colors"
              >
                {link.label} ↗
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
                  isActive(link.href)
                    ? 'text-[#f5a623] bg-[#f5a623]/10'
                    : 'text-[#c8a882] hover:text-[#f5a623]'
                }`}
              >
                {link.label}
              </Link>
            )
          )}
        </nav>

        {/* CTA + hamburger */}
        <div className="flex items-center gap-3">
          <Link
            href="/signup"
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg bg-[#c41e3a] text-white text-sm font-bold hover:bg-[#a01830] transition-colors"
          >
            Join the App
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden p-2 rounded-md text-[#c8a882] hover:text-[#f5a623]"
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-[#2a1a0e] bg-[#0d0a07] px-5 py-4 space-y-1">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 text-sm font-medium text-[#c8a882] hover:text-[#f5a623]"
              >
                {link.label} ↗
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                  isActive(link.href) ? 'text-[#f5a623]' : 'text-[#c8a882] hover:text-[#f5a623]'
                }`}
              >
                {link.label}
              </Link>
            )
          )}
          <div className="pt-3 border-t border-[#2a1a0e]">
            <Link
              href="/signup"
              onClick={() => setMenuOpen(false)}
              className="block w-full text-center px-4 py-2.5 rounded-lg bg-[#c41e3a] text-white text-sm font-bold"
            >
              Join the App
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
