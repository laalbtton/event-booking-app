'use client'

import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

type SettingsListRowProps = {
  href: string
  icon: LucideIcon
  title: string
  description?: string
}

export function SettingsListRow({ href, icon: Icon, title, description }: SettingsListRowProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 -mx-4 rounded-lg hover:bg-muted transition-colors"
    >
      <div className="flex flex-shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground truncate">{description}</p>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
    </Link>
  )
}
