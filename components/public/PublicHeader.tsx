'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Button } from '@/components/ui/button'

export function PublicHeader() {
  const { authResolved, user } = useAuthBootstrap()

  // If user is logged in, don't show the public header — NavigationTabs handles app nav
  if (authResolved && user) return null

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <Image
            src="/mic-stool.png"
            alt=""
            width={28}
            height={22}
            className="h-7 w-auto grayscale invert mix-blend-multiply dark:invert-0 dark:mix-blend-screen dark:opacity-70"
          />
          One Mic Stand
        </Link>

        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
          <Link href="/events" className="hover:text-foreground/80 transition-colors">
            Events
          </Link>
          <Link href="/communities" className="hover:text-foreground/80 transition-colors">
            Communities
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      </div>

      {/* Mobile nav links */}
      <div className="flex sm:hidden items-center gap-5 px-4 pb-2 text-sm font-medium">
        <Link href="/events" className="hover:text-foreground/80 transition-colors">
          Events
        </Link>
        <Link href="/communities" className="hover:text-foreground/80 transition-colors">
          Communities
        </Link>
      </div>
    </header>
  )
}
