'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'

/** Root app footer — hidden on marketing routes that ship their own footer. */
export default function ConditionalAppFooter() {
  const pathname = usePathname()
  const { authResolved, user } = useAuthBootstrap()

  if (pathname?.startsWith('/laalbutton')) return null
  // Public performer profiles use their own chrome; hide marketing footer when in-app
  if (authResolved && user && pathname?.startsWith('/profile/')) return null
  if (authResolved && user && pathname?.startsWith('/brampton-comedy-insider')) return null

  return (
    <footer className="bg-gray-800 text-white py-6 mt-auto pb-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm">© 2025 Laal Button. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/contact" className="text-sm hover:text-gray-300">
              Contact
            </Link>
            <Link href="/buy-credits" className="text-sm hover:text-gray-300">
              Buy Credits
            </Link>
            <a
              href="https://laalbutton.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-gray-300"
            >
              About
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
