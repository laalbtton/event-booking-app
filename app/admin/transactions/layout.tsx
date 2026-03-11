'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function TransactionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isCreditsReport = pathname === '/admin/transactions/credits-report'

  return (
    <div className="space-y-4">
      <nav className="flex gap-4 border-b border-gray-200 pb-2">
        <Link
          href="/admin/transactions"
          className={`font-medium text-sm transition-colors ${
            !isCreditsReport
              ? 'text-purple-600 border-b-2 border-purple-600 pb-2 -mb-0.5'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Transactions
        </Link>
        <Link
          href="/admin/transactions/credits-report"
          className={`font-medium text-sm transition-colors ${
            isCreditsReport
              ? 'text-purple-600 border-b-2 border-purple-600 pb-2 -mb-0.5'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Credits Report
        </Link>
      </nav>
      {children}
    </div>
  )
}
