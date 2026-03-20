import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function BookingDetailSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 py-6 pb-20">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-6 w-32 rounded" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-2/3 rounded" />
          <Skeleton className="h-4 w-1/2 rounded mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-32 rounded" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-md mt-4" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40 rounded" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full rounded" />
        </CardContent>
      </Card>
    </div>
  )
}
