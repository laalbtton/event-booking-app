import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function EventCardSkeleton() {
  return (
    <Card className="rounded-none sm:rounded-lg border-x-0 sm:border-x">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2">
          <Skeleton className="h-5 w-3/5 rounded" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-4/5 rounded" />
        <div className="flex items-center gap-3 pt-1">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md mt-2" />
      </CardContent>
    </Card>
  )
}
