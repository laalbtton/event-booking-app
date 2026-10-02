'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_LOGOS = {
  yellow: {
    src: '/images/YellowLogoSmall_website_Top.png',
    width: 872,
    height: 207,
  },
  black: {
    src: '/images/BlackLogoSmall_website_Top.png',
    width: 937,
    height: 220,
  },
} as const

/** Dark header: use `yellow`. Light header: use `black`. */
const NAV_LOGO: keyof typeof NAV_LOGOS = 'yellow'

const PERFORMER_LINKS = [
  { href: '/performers', label: 'Performers' },
  { href: '/feed', label: 'Feed' },
] as const

function navLinkClass(active?: boolean) {
  return cn(
    'text-stone-300 hover:text-stone-100 transition-colors',
    active && 'text-stone-100'
  )
}

function PerformersMenu() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = PERFORMER_LINKS.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  ) || pathname === '/jokes' || pathname.startsWith('/jokes/')

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className={cn(navLinkClass(active), 'inline-flex items-center gap-0.5')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        Performers
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-red-600/40 bg-zinc-950 py-1 shadow-lg"
        >
          {PERFORMER_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className={cn(
                'block px-3 py-2 text-sm text-stone-300 hover:bg-zinc-800 hover:text-stone-100',
                pathname === item.href && 'text-yellow-400'
              )}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/jokes"
            role="menuitem"
            className={cn(
              'block px-3 py-2 pl-6 text-sm text-stone-400 hover:bg-zinc-800 hover:text-stone-100',
              pathname === '/jokes' && 'text-yellow-400'
            )}
          >
            Jokes
          </Link>
        </div>
      )}
    </div>
  )
}

export function PublicHeader() {
  const { authResolved, user } = useAuthBootstrap()
  const logo = NAV_LOGOS[NAV_LOGO]

  // If user is logged in, don't show the public header — NavigationTabs handles app nav
  if (authResolved && user) return null

  return (
    <header className="sticky top-0 z-40 w-full border-b border-red-600/50 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex shrink-0 items-center" aria-label="One Mic Stand home">
          <Image
            src={logo.src}
            alt="One Mic Stand"
            width={logo.width}
            height={logo.height}
            className="h-8 w-auto"
            priority
          />
        </Link>

        <nav className="hidden sm:flex items-center gap-5 text-sm font-medium">
          <Link href="/events" className={navLinkClass()}>
            Events
          </Link>
          <Link href="/brampton" className={navLinkClass()}>
            Brampton
          </Link>
          <PerformersMenu />
          <Link href="/communities" className={navLinkClass()}>
            Communities
          </Link>
          <Link href="/download" className={navLinkClass()}>
            Get the app
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="text-stone-300 hover:text-stone-100 hover:bg-zinc-800">
            <Link href="/login">Log in</Link>
          </Button>
          <Button size="sm" asChild className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      </div>

      {/* Mobile nav links */}
      <div className="flex sm:hidden items-center gap-4 px-4 pb-2 text-sm font-medium">
        <Link href="/events" className="shrink-0 text-stone-300 hover:text-stone-100 transition-colors">
          Events
        </Link>
        <Link href="/brampton" className="shrink-0 text-stone-300 hover:text-stone-100 transition-colors">
          Brampton
        </Link>
        <PerformersMenu />
        <Link href="/communities" className="shrink-0 text-stone-300 hover:text-stone-100 transition-colors">
          Communities
        </Link>
        <Link href="/download" className="shrink-0 text-stone-300 hover:text-stone-100 transition-colors">
          Get the app
        </Link>
      </div>
    </header>
  )
}
