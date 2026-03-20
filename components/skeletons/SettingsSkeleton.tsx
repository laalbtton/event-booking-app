import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

export function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Profile section */}
      <div className="flex items-center gap-4 p-4">
        <Skeleton className="h-16 w-16 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-40 rounded" />
          <Skeleton className="h-4 w-28 rounded" />
        </div>
      </div>

      {/* Settings rows */}
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
            </div>
            <Skeleton className="h-4 w-4 rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
