'use client'

/**
 * RecurrencePicker
 *
 * A self-contained form section for selecting a recurring event pattern.
 * Rendered inside the create-event form when the user toggles "Make this recurring".
 */

import { Label } from '@/components/ui/label'

export type RecurrenceConfig = {
  recurrence_type: 'weekly' | 'biweekly' | 'monthly_weekday'
  day_of_week: number        // 0 (Sun) – 6 (Sat)
  week_of_month: number      // 1 | 2 | 3 | 4 | -1 (last); only for monthly_weekday
  start_time_local: string   // 'HH:MM' Eastern wall-clock, e.g. '20:00'
  horizon_weeks: number
}

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const WEEK_OPTIONS = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' },
  { value: 4, label: '4th' },
  { value: -1, label: 'Last' },
]

const HORIZON_OPTIONS = [4, 8, 12, 16, 20, 24]

interface Props {
  value: RecurrenceConfig
  onChange: (next: RecurrenceConfig) => void
  /** Pre-filled day-of-week from the selected event date (0-6). */
  prefillDayOfWeek?: number
}

export default function RecurrencePicker({ value, onChange, prefillDayOfWeek }: Props) {
  function set<K extends keyof RecurrenceConfig>(key: K, val: RecurrenceConfig[K]) {
    onChange({ ...value, [key]: val })
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
      <p className="text-sm font-medium text-foreground">Recurrence settings</p>

      {/* Recurrence type */}
      <div className="space-y-1.5">
        <Label>Repeats</Label>
        <select
          value={value.recurrence_type}
          onChange={(e) =>
            set('recurrence_type', e.target.value as RecurrenceConfig['recurrence_type'])
          }
          className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly (every 2 weeks)</option>
          <option value="monthly_weekday">Monthly (same weekday)</option>
        </select>
      </div>

      {/* Day of week */}
      <div className="space-y-1.5">
        <Label>Day of week</Label>
        <select
          value={value.day_of_week}
          onChange={(e) => set('day_of_week', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
              {d.value === prefillDayOfWeek ? ' (from selected date)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Week-of-month (only for monthly_weekday) */}
      {value.recurrence_type === 'monthly_weekday' && (
        <div className="space-y-1.5">
          <Label>Which occurrence in the month</Label>
          <select
            value={value.week_of_month}
            onChange={(e) => set('week_of_month', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {WEEK_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Start time (Eastern) */}
      <div className="space-y-1.5">
        <Label>Start time (Eastern Time)</Label>
        <input
          type="time"
          value={value.start_time_local}
          onChange={(e) => set('start_time_local', e.target.value)}
          className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
        <p className="text-xs text-muted-foreground">
          This is the wall-clock start time in Eastern Time (ET) for all occurrences.
        </p>
      </div>

      {/* Horizon */}
      <div className="space-y-1.5">
        <Label>Generate occurrences up to</Label>
        <select
          value={value.horizon_weeks}
          onChange={(e) => set('horizon_weeks', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {HORIZON_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w} weeks ahead
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          New occurrences will be auto-generated weekly to stay within this window.
        </p>
      </div>
    </div>
  )
}
