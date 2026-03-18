'use client'

import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'

type Props = {
  text: string
  collapsedLines?: number
  textClassName?: string
  buttonClassName?: string
  minCharsToTruncate?: number
}

export function ExpandableEventDescription({
  text,
  collapsedLines = 4,
  textClassName = 'whitespace-pre-wrap break-words leading-relaxed',
  buttonClassName = 'text-primary hover:opacity-90 underline underline-offset-2',
  minCharsToTruncate = 260,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const normalized = useMemo(() => (text || '').trim(), [text])
  const shouldTruncate = useMemo(() => {
    if (!normalized) return false
    const lineCount = normalized.split(/\r?\n/).length
    return normalized.length > minCharsToTruncate || lineCount > collapsedLines
  }, [normalized, minCharsToTruncate, collapsedLines])

  if (!normalized) return null

  const clampStyle: CSSProperties | undefined = expanded
    ? undefined
    : {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        WebkitLineClamp: collapsedLines,
      }

  return (
    <div className="space-y-2">
      <p className={textClassName} style={clampStyle}>
        {normalized}
      </p>

      {shouldTruncate && (
        <button
          type="button"
          className={buttonClassName}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'View less' : 'View more'}
        </button>
      )}
    </div>
  )
}

