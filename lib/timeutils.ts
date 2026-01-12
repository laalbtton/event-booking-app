export function getTimeUntilEvent(eventDate: string): {
  timeString: string
  hoursRemaining: number
  isPast: boolean
} {
  const now = new Date()
  const event = new Date(eventDate)
  const diffMs = event.getTime() - now.getTime()
  const hoursRemaining = diffMs / (1000 * 60 * 60)

  // Event has passed
  if (diffMs < 0) {
    return {
      timeString: 'Event has passed',
      hoursRemaining: 0,
      isPast: true
    }
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  // Build time string based on how much time is left
  let parts = []
  
  if (days > 0) {
    parts.push(`${days}d`)
  }
  
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`)
  }
  
  if (days === 0) { // Only show minutes if less than a day
    parts.push(`${minutes}m`)
  }

  const timeString = parts.join(' ')

  return {
    timeString: timeString || '0m',
    hoursRemaining,
    isPast: false
  }
}

export function getRefundStatus(eventDate: string, cancellationHours: number): {
  willGetRefund: boolean
  message: string
} {
  const { hoursRemaining } = getTimeUntilEvent(eventDate)
  const willGetRefund = hoursRemaining >= cancellationHours

  if (willGetRefund) {
    return {
      willGetRefund: true,
      message: '✓ Full refund available'
    }
  } else {
    return {
      willGetRefund: false,
      message: `⚠️ No refund (within ${cancellationHours}h window)`
    }
  }
}