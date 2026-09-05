'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Button } from '@/components/ui/button'

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

        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
          <Link href="/events" className="text-stone-300 hover:text-stone-100 transition-colors">
            Events
          </Link>
          <Link href="/communities" className="text-stone-300 hover:text-stone-100 transition-colors">
            Communities
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
      <div className="flex sm:hidden items-center gap-5 px-4 pb-2 text-sm font-medium">
        <Link href="/events" className="text-stone-300 hover:text-stone-100 transition-colors">
          Events
        </Link>
        <Link href="/communities" className="text-stone-300 hover:text-stone-100 transition-colors">
          Communities
        </Link>
      </div>
    </header>
  )
}
