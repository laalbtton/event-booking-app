'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'

type NavLeaf = {
  type: 'link'
  label: string
  href: string
  external?: boolean
}

type NavGroup = {
  type: 'group'
  label: string
  children: NavItem[]
}

type NavItem = NavLeaf | NavGroup

const BRAMPTON_MIC = '/laalbutton/multilingual-comedy/brampton-open-mic'
const TORONTO_MIC = '/laalbutton/multilingual-comedy/toronto-open-mic'
const PIT = '/laalbutton/punjabis-in-tech'

const WORKSHOPS_HREF = '/laalbutton/workshops'

const NETWORKING_ITEMS: NavItem[] = [
  { type: 'link', label: 'Punjabis in Tech', href: PIT },
]

const WORKSHOPS_ITEMS: NavItem[] = [
  { type: 'link', label: 'Creativity Workshops (Improv)', href: `${WORKSHOPS_HREF}#creativity-improv` },
  { type: 'link', label: 'Seniors Stand up Workshops', href: `${WORKSHOPS_HREF}#seniors-standup` },
]

const THEATRE_ITEMS: NavItem[] = [
  { type: 'link', label: 'Satrang', href: 'https://laalbutton.com/satrang', external: true },
]

const COMEDY_ITEMS: NavItem[] = [
  {
    type: 'group',
    label: 'Punjabi',
    children: [
      { type: 'link', label: 'Punjabis in Tech', href: PIT },
      { type: 'link', label: 'Brampton Open Mic', href: BRAMPTON_MIC },
    ],
  },
  {
    type: 'group',
    label: 'Hindi',
    children: [
      { type: 'link', label: 'Roti Kapda Aur Comedy', href: '/laalbutton/roti-kapda-aur-comedy' },
    ],
  },
  {
    type: 'group',
    label: 'English',
    children: [
      { type: 'link', label: 'Immigrants With Attitude', href: '/laalbutton/immigrants-with-attitude' },
    ],
  },
  {
    type: 'group',
    label: 'Open Mics',
    children: [
      { type: 'link', label: 'Brampton Open Mic', href: BRAMPTON_MIC },
      { type: 'link', label: 'Toronto Open Mic', href: TORONTO_MIC },
    ],
  },
]

function linkClass(active: boolean) {
  return active
    ? 'text-[#f5a623] bg-[#f5a623]/10'
    : 'text-[#c8a882] hover:text-[#f5a623]'
}

function isPathActive(pathname: string, href: string) {
  return href.startsWith('/laalbutton') && pathname === href.split('#')[0]
}

function groupHasActive(pathname: string, items: NavItem[]): boolean {
  return items.some((item) =>
    item.type === 'link' ? isPathActive(pathname, item.href) : groupHasActive(pathname, item.children),
  )
}

function DesktopFlyout({
  items,
  pathname,
  depth = 0,
}: {
  items: NavItem[]
  pathname: string
  depth?: number
}) {
  const [openLabel, setOpenLabel] = useState<string | null>(null)

  return (
    <div
      className={`rounded-lg border border-[#2a1a0e] bg-[#0d0a07] py-1 shadow-xl shadow-black/40 ${
        depth === 0 ? 'min-w-[12.5rem]' : 'min-w-[14rem]'
      }`}
    >
      {items.map((item) => {
        if (item.type === 'link') {
          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2.5 text-sm font-medium text-[#c8a882] transition-colors hover:bg-[#120c06] hover:text-[#f5a623]"
              >
                {item.label} ↗
              </a>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`block px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#120c06] hover:text-[#f5a623] ${
                isPathActive(pathname, item.href) ? 'text-[#f5a623]' : 'text-[#c8a882]'
              }`}
            >
              {item.label}
            </Link>
          )
        }

        const open = openLabel === item.label
        return (
          <div
            key={item.label}
            className="relative"
            onMouseEnter={() => setOpenLabel(item.label)}
            onMouseLeave={() => setOpenLabel(null)}
          >
            <button
              type="button"
              className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-[#120c06] hover:text-[#f5a623] ${
                groupHasActive(pathname, item.children) || open ? 'text-[#f5a623]' : 'text-[#c8a882]'
              }`}
            >
              {item.label}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </button>
            {open && (
              <div className="absolute left-full top-0 pl-1">
                <DesktopFlyout items={item.children} pathname={pathname} depth={depth + 1} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DesktopDropdown({
  label,
  items,
  pathname,
  active,
}: {
  label: string
  items: NavItem[]
  pathname: string
  active: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${linkClass(active || open)}`}
        aria-expanded={open}
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-1 z-50">
          <DesktopFlyout items={items} pathname={pathname} />
        </div>
      )}
    </div>
  )
}

function MobileNavItems({
  items,
  pathname,
  depth,
  onNavigate,
  openKey,
  setOpenKey,
  keyPrefix,
}: {
  items: NavItem[]
  pathname: string
  depth: number
  onNavigate: () => void
  openKey: string | null
  setOpenKey: (key: string | null) => void
  keyPrefix: string
}) {
  return (
    <div className={depth > 0 ? 'ml-3 mt-1 space-y-1 border-l border-[#2a1a0e] pl-3' : 'space-y-1'}>
      {items.map((item) => {
        if (item.type === 'link') {
          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavigate}
                className="block px-3 py-2 text-sm font-medium text-[#c8a882] hover:text-[#f5a623]"
              >
                {item.label} ↗
              </a>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isPathActive(pathname, item.href)
                  ? 'text-[#f5a623]'
                  : depth > 0
                    ? 'text-[#8a6a4a] hover:text-[#f5a623]'
                    : linkClass(false)
              }`}
            >
              {item.label}
            </Link>
          )
        }

        const itemKey = `${keyPrefix}:${item.label}`
        const isOpen = openKey === itemKey || openKey?.startsWith(`${itemKey}:`)
        return (
          <div key={item.label}>
            <button
              type="button"
              onClick={() =>
                setOpenKey(
                  openKey === itemKey || openKey?.startsWith(`${itemKey}:`)
                    ? keyPrefix
                    : itemKey,
                )
              }
              className={`flex w-full items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                groupHasActive(pathname, item.children) || isOpen
                  ? 'text-[#f5a623]'
                  : depth > 0
                    ? 'text-[#8a6a4a] hover:text-[#f5a623]'
                    : 'text-[#c8a882] hover:text-[#f5a623]'
              }`}
            >
              {item.label}
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <MobileNavItems
                items={item.children}
                pathname={pathname}
                depth={depth + 1}
                onNavigate={onNavigate}
                openKey={openKey}
                setOpenKey={setOpenKey}
                keyPrefix={itemKey}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function LBHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpenKey, setMobileOpenKey] = useState<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    setMenuOpen(false)
    setMobileOpenKey(null)
  }, [pathname])

  const networkingActive = groupHasActive(pathname, NETWORKING_ITEMS)
  const comedyActive = groupHasActive(pathname, COMEDY_ITEMS)
  const workshopsActive = pathname.startsWith(WORKSHOPS_HREF)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#2a1a0e] bg-[#0d0a07]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/laalbutton" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/laalbutton-logo-white.png"
            alt="Laal Button Comedy"
            className="h-14 w-auto object-contain"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          <Link
            href="/laalbutton/about"
            className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${linkClass(isPathActive(pathname, '/laalbutton/about'))}`}
          >
            About
          </Link>

          <DesktopDropdown
            label="Networking"
            items={NETWORKING_ITEMS}
            pathname={pathname}
            active={networkingActive}
          />

          <DesktopDropdown
            label="Comedy"
            items={COMEDY_ITEMS}
            pathname={pathname}
            active={comedyActive}
          />

          <DesktopDropdown
            label="Workshops"
            items={WORKSHOPS_ITEMS}
            pathname={pathname}
            active={workshopsActive}
          />

          <DesktopDropdown
            label="Theatre"
            items={THEATRE_ITEMS}
            pathname={pathname}
            active={false}
          />

          <Link
            href="/promotions"
            className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${linkClass(pathname.startsWith('/promotions'))}`}
          >
            Promotions
          </Link>
        </nav>

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
          <Link
            href="/laalbutton/about"
            onClick={() => setMenuOpen(false)}
            className={`block px-3 py-2 text-sm font-medium transition-colors rounded-md ${linkClass(isPathActive(pathname, '/laalbutton/about'))}`}
          >
            About
          </Link>

          <div>
            <button
              type="button"
              onClick={() =>
                setMobileOpenKey(mobileOpenKey === 'networking' || mobileOpenKey?.startsWith('networking:') ? null : 'networking')
              }
              className={`flex w-full items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${linkClass(
                networkingActive || mobileOpenKey === 'networking' || !!mobileOpenKey?.startsWith('networking:'),
              )}`}
            >
              Networking
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  mobileOpenKey === 'networking' || mobileOpenKey?.startsWith('networking:') ? 'rotate-180' : ''
                }`}
              />
            </button>
            {(mobileOpenKey === 'networking' || mobileOpenKey?.startsWith('networking:')) && (
              <MobileNavItems
                items={NETWORKING_ITEMS}
                pathname={pathname}
                depth={1}
                onNavigate={() => setMenuOpen(false)}
                openKey={mobileOpenKey}
                setOpenKey={setMobileOpenKey}
                keyPrefix="networking"
              />
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() =>
                setMobileOpenKey(mobileOpenKey === 'comedy' || mobileOpenKey?.startsWith('comedy:') ? null : 'comedy')
              }
              className={`flex w-full items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${linkClass(
                comedyActive || mobileOpenKey === 'comedy' || !!mobileOpenKey?.startsWith('comedy:'),
              )}`}
            >
              Comedy
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  mobileOpenKey === 'comedy' || mobileOpenKey?.startsWith('comedy:') ? 'rotate-180' : ''
                }`}
              />
            </button>
            {(mobileOpenKey === 'comedy' || mobileOpenKey?.startsWith('comedy:')) && (
              <MobileNavItems
                items={COMEDY_ITEMS}
                pathname={pathname}
                depth={1}
                onNavigate={() => setMenuOpen(false)}
                openKey={mobileOpenKey}
                setOpenKey={setMobileOpenKey}
                keyPrefix="comedy"
              />
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() =>
                setMobileOpenKey(mobileOpenKey === 'workshops' || mobileOpenKey?.startsWith('workshops:') ? null : 'workshops')
              }
              className={`flex w-full items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${linkClass(
                workshopsActive || mobileOpenKey === 'workshops' || !!mobileOpenKey?.startsWith('workshops:'),
              )}`}
            >
              Workshops
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  mobileOpenKey === 'workshops' || mobileOpenKey?.startsWith('workshops:') ? 'rotate-180' : ''
                }`}
              />
            </button>
            {(mobileOpenKey === 'workshops' || mobileOpenKey?.startsWith('workshops:')) && (
              <MobileNavItems
                items={WORKSHOPS_ITEMS}
                pathname={pathname}
                depth={1}
                onNavigate={() => setMenuOpen(false)}
                openKey={mobileOpenKey}
                setOpenKey={setMobileOpenKey}
                keyPrefix="workshops"
              />
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() =>
                setMobileOpenKey(mobileOpenKey === 'theatre' || mobileOpenKey?.startsWith('theatre:') ? null : 'theatre')
              }
              className={`flex w-full items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${linkClass(
                mobileOpenKey === 'theatre' || !!mobileOpenKey?.startsWith('theatre:'),
              )}`}
            >
              Theatre
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  mobileOpenKey === 'theatre' || mobileOpenKey?.startsWith('theatre:') ? 'rotate-180' : ''
                }`}
              />
            </button>
            {(mobileOpenKey === 'theatre' || mobileOpenKey?.startsWith('theatre:')) && (
              <MobileNavItems
                items={THEATRE_ITEMS}
                pathname={pathname}
                depth={1}
                onNavigate={() => setMenuOpen(false)}
                openKey={mobileOpenKey}
                setOpenKey={setMobileOpenKey}
                keyPrefix="theatre"
              />
            )}
          </div>

          <Link
            href="/promotions"
            onClick={() => setMenuOpen(false)}
            className={`block px-3 py-2 text-sm font-medium transition-colors rounded-md ${linkClass(pathname.startsWith('/promotions'))}`}
          >
            Promotions
          </Link>

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
