'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeTagName, type Tag } from '@/lib/crm'

type TagInputProps = {
  value: string[]
  onChange: (next: string[]) => void
  /** Existing tags for autocomplete (names). */
  suggestions: Tag[]
  placeholder?: string
  id?: string
  disabled?: boolean
  className?: string
  /** Enter with an empty draft bubbles up so the parent form can submit. */
  onSubmitRequest?: () => void
}

/**
 * Chip-style tag editor. Type to filter suggestions; Enter or comma commits
 * the draft (creating a new tag name if it does not exist). Backspace on an
 * empty draft removes the last chip.
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder = 'Add tag…',
  id,
  disabled,
  className,
  onSubmitRequest,
}: TagInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-list`
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const lowerSelected = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value])

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase()
    return suggestions
      .filter((t) => !lowerSelected.has(t.name.toLowerCase()))
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [draft, suggestions, lowerSelected])

  const exactExists = useMemo(() => {
    const q = draft.trim().toLowerCase()
    return !!q && suggestions.some((t) => t.name.toLowerCase() === q)
  }, [draft, suggestions])

  const showCreateRow = draft.trim() !== '' && !exactExists && !lowerSelected.has(draft.trim().toLowerCase())
  const options = useMemo(
    () => [
      ...filtered.map((t) => ({ kind: 'existing' as const, name: t.name, count: t.count })),
      ...(showCreateRow ? [{ kind: 'create' as const, name: normalizeTagName(draft), count: undefined }] : []),
    ],
    [filtered, showCreateRow, draft],
  )

  function commit(raw: string) {
    const name = normalizeTagName(raw)
    if (!name) return
    if (!lowerSelected.has(name.toLowerCase())) onChange([...value, name])
    setDraft('')
    setOpen(false)
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name))
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (draft.trim() === '') {
        // Let the parent form handle submit.
        if (onSubmitRequest) {
          e.preventDefault()
          onSubmitRequest()
        }
        return
      }
      e.preventDefault()
      const chosen = open && options[active] ? options[active].name : draft
      commit(chosen)
    } else if (e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && value.length) {
      e.preventDefault()
      onChange(value.slice(0, -1))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, Math.max(options.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled && 'opacity-50',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((name) => (
          <span
            key={name}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-xs font-medium text-secondary-foreground"
          >
            {name}
            <button
              type="button"
              aria-label={`Remove tag ${name}`}
              onClick={(e) => {
                e.stopPropagation()
                remove(name)
              }}
              disabled={disabled}
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-foreground/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          value={draft}
          disabled={disabled}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => {
            setDraft(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so option clicks register before the list disappears.
            setTimeout(() => setOpen(false), 120)
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
          className="min-w-[6rem] flex-1 bg-transparent py-1 text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {options.map((opt, i) => (
            <li
              key={`${opt.kind}-${opt.name}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(opt.name)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex min-h-10 cursor-pointer items-center justify-between rounded-sm px-2 py-1.5',
                i === active ? 'bg-accent text-accent-foreground' : 'text-popover-foreground',
              )}
            >
              <span className="truncate">
                {opt.kind === 'create' ? (
                  <>
                    Create <span className="font-semibold">“{opt.name}”</span>
                  </>
                ) : (
                  opt.name
                )}
              </span>
              {opt.kind === 'existing' && typeof opt.count === 'number' && (
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{opt.count}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
