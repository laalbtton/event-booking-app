import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function CreditHistorySkeleton() {
  return (
    <div className="space-y-6">
      {/* Balance card */}
      <Card className="border-yellow-400/30 bg-yellow-400/10">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-8 w-16 rounded" />
          </div>
          <Skeleton className="h-9 w-32 rounded-md" />
        </CardContent>
      </Card>

      {/* Transaction rows */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40 rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="space-y-1">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
