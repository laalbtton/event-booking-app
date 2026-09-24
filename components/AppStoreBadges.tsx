'use client'

import Link from 'next/link'
import { APP_STORE_URL, DOWNLOAD_PATH, PLAY_STORE_URL } from '@/lib/appStores'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

type Props = {
  className?: string
  align?: 'start' | 'center' | 'end'
  label?: string | null
  /** Light text for dark footers */
  light?: boolean
}

export function AppStoreBadges({
  className,
  align = 'center',
  label = 'Get the app',
  light = false,
}: Props) {
  const [hide, setHide] = useState(false)

  useEffect(() => {
    try {
      // Native store builds already are the app — don't pitch the stores again.
      const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      if (cap?.isNativePlatform?.()) setHide(true)
    } catch {
      // ignore
    }
  }, [])

  if (hide) return null

  const alignClass =
    align === 'start' ? 'items-start' : align === 'end' ? 'items-end' : 'items-center'

  return (
    <div className={cn('flex flex-col gap-2', alignClass, className)}>
      {label ? (
        <p className={cn('text-xs font-medium', light ? 'text-white/70' : 'text-muted-foreground')}>
          {label}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download on the App Store"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/store/app-store.svg"
            alt="Download on the App Store"
            width={135}
            height={45}
            className="h-[45px] w-auto"
          />
        </a>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get it on Google Play"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/store/google-play.svg"
            alt="Get it on Google Play"
            width={152}
            height={45}
            className="h-[45px] w-auto"
          />
        </a>
      </div>
      <Link
        href={DOWNLOAD_PATH}
        className={cn(
          'text-xs underline underline-offset-2',
          light ? 'text-white/70 hover:text-white' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        All download options
      </Link>
    </div>
  )
}
