'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Download, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { ContactQuickAdd } from '@/components/crm/ContactQuickAdd'
import { ContactFilters } from '@/components/crm/ContactFilters'
import { ContactList } from '@/components/crm/ContactList'
import { ContactDrawer } from '@/components/crm/ContactDrawer'
import { ManageTagsDialog } from '@/components/crm/ManageTagsDialog'
import { BulkActionsBar } from '@/components/crm/BulkActionsBar'
import {
  DEFAULT_PAGE_SIZE,
  filtersToSearchParams,
  searchParamsToFilters,
  type Contact,
  type ContactFilters as Filters,
  type InviteStatus,
  type Tag,
} from '@/lib/crm'
import { bulkAction, exportContacts, fetchContacts, type ExportTarget } from '@/lib/crmClient'
import { copyText, hapticLight, saveOrShareTextFile } from '@/lib/platform'

export default function CrmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <CrmPageInner />
    </Suspense>
  )
}

function CrmPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { authResolved, user } = useAuthBootstrap()
  const { confirm } = useConfirmDialog()

  const filters = useMemo<Filters>(() => searchParamsToFilters(new URLSearchParams(searchParams.toString())), [searchParams])
  const quickAddPrefill = useMemo(() => {
    if (searchParams.get('quickadd') !== '1') return undefined
    return {
      name: searchParams.get('name') ?? '',
      phone: searchParams.get('phone') ?? '',
      email: searchParams.get('email') ?? '',
    }
  }, [searchParams])

  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [tags, setTags] = useState<Tag[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadedPages, setLoadedPages] = useState(1)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [allFilteredSelected, setAllFilteredSelected] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const [active, setActive] = useState<Contact | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(true)
  const [lastCity, setLastCity] = useState<string | undefined>(undefined)

  const requestSeq = useRef(0)

  // Auth gate
  useEffect(() => {
    if (!authResolved) return
    if (!user) router.replace('/login?returnTo=/crm')
  }, [authResolved, user, router])

  const setFilters = useCallback(
    (next: Filters) => {
      const params = filtersToSearchParams({ ...next, page: 1 })
      if (searchParams.get('quickadd') === '1') params.set('quickadd', '1')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!user) return
      const seq = ++requestSeq.current
      if (!opts.silent) setLoading(true)
      try {
        const page = await fetchContacts({ ...filters, page: 1 }, DEFAULT_PAGE_SIZE)
        if (seq !== requestSeq.current) return
        setContacts(page.contacts)
        setTotal(page.total)
        setTags(page.tags)
        setCities(page.cities)
        setLoadedPages(1)
      } catch (err) {
        if (seq !== requestSeq.current) return
        toast.error(err instanceof Error ? err.message : 'Could not load contacts')
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [user, filters],
  )

  useEffect(() => {
    void load()
    setSelected(new Set())
    setAllFilteredSelected(false)
  }, [load])

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const next = loadedPages + 1
      const page = await fetchContacts({ ...filters, page: next }, DEFAULT_PAGE_SIZE)
      setContacts((prev) => {
        const seen = new Set(prev.map((c) => c.id))
        return [...prev, ...page.contacts.filter((c) => !seen.has(c.id))]
      })
      setTotal(page.total)
      setLoadedPages(next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load more')
    } finally {
      setLoadingMore(false)
    }
  }

  const hasFilters = Boolean(filters.q || (filters.tags && filters.tags.length) || filters.city || filters.status)

  // ── Mutations from children ────────────────────────────────
  function onCreated(contact: Contact) {
    if (contact.city) setLastCity(contact.city)
    // Optimistic: show at top if it fits the current view, then refresh facets.
    if (!hasFilters && (filters.sort ?? 'newest') === 'newest') {
      setContacts((prev) => [contact, ...prev])
      setTotal((t) => t + 1)
    }
    void load({ silent: true })
  }

  function onSaved(updated: Contact) {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    void load({ silent: true })
  }

  function onDeleted(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id))
    setTotal((t) => Math.max(0, t - 1))
    setSelected((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
    void load({ silent: true })
  }

  function openContact(c: Contact) {
    setActive(c)
    setDrawerOpen(true)
  }

  // ── Selection ──────────────────────────────────────────────
  function toggleSelect(id: string) {
    setAllFilteredSelected(false)
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleSelectPage() {
    setAllFilteredSelected(false)
    setSelected((s) => {
      const everyShown = contacts.every((c) => s.has(c.id))
      if (everyShown) return new Set()
      return new Set(contacts.map((c) => c.id))
    })
  }

  function clearSelection() {
    setSelected(new Set())
    setAllFilteredSelected(false)
  }

  const bulkTarget = useCallback((): ExportTarget => {
    if (allFilteredSelected) {
      const { page: _p, pageSize: _ps, ...rest } = filters
      void _p
      void _ps
      return { filters: rest }
    }
    return { ids: Array.from(selected) }
  }, [allFilteredSelected, filters, selected])

  async function runBulk(fn: () => Promise<{ affected: number }>, successMsg: (n: number) => string) {
    setBulkBusy(true)
    try {
      const { affected } = await fn()
      void hapticLight()
      toast.success(successMsg(affected))
      clearSelection()
      await load({ silent: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed')
    } finally {
      setBulkBusy(false)
    }
  }

  // ── Export ─────────────────────────────────────────────────
  async function doExportCsv(target: ExportTarget) {
    try {
      const { content, count, filename } = await exportContacts(target, 'csv')
      if (!count) {
        toast.info('Nothing to export')
        return
      }
      const result = await saveOrShareTextFile({ filename, content, mimeType: 'text/csv', title: 'Contacts CSV' })
      if (result === 'failed') toast.error('Could not export')
      else if (result === 'downloaded') toast.success(`Exported ${count} contact${count === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

  async function doCopyEmails(target: ExportTarget) {
    try {
      const { content, count } = await exportContacts(target, 'emails')
      if (!count) {
        toast.info('No emails in that set')
        return
      }
      const ok = await copyText(content)
      if (ok) {
        void hapticLight()
        toast.success(`Copied ${count} email${count === 1 ? '' : 's'}`)
      } else toast.error('Clipboard blocked — try again after tapping the page')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Copy failed')
    }
  }

  const filteredTarget: ExportTarget = useMemo(() => {
    const { page: _p, pageSize: _ps, ...rest } = filters
    void _p
    void _ps
    return { filters: rest }
  }, [filters])

  if (!authResolved || !user) {
    return <div className="min-h-screen bg-background" />
  }

  const selectionActive = selected.size > 0 || allFilteredSelected

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">CRM</h1>
            <p className="text-sm text-muted-foreground">People you&apos;ve met and might invite to a show. Only you can see this.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void doExportCsv(filteredTarget)} disabled={total === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void doCopyEmails(filteredTarget)} disabled={total === 0}>
              <Mail className="h-4 w-4" /> Copy emails
            </Button>
          </div>
        </header>

        <section aria-label="Add a contact">
          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            aria-expanded={addOpen}
            className="mb-2 flex min-h-9 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground sm:hidden"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${addOpen ? 'rotate-180' : ''}`} />
            {addOpen ? 'Hide add form' : 'Add someone'}
          </button>
          <div className={addOpen ? '' : 'hidden sm:block'}>
            <ContactQuickAdd
              tagSuggestions={tags}
              onCreated={onCreated}
              onOpenExisting={openContact}
              initial={quickAddPrefill}
              lastCity={lastCity}
            />
          </div>
        </section>

        <section aria-label="Filter contacts">
          <ContactFilters
            filters={filters}
            onChange={setFilters}
            tags={tags}
            cities={cities}
            total={total}
            onManageTags={() => setTagsOpen(true)}
          />
        </section>

        <section aria-label="Contacts">
          <ContactList
            contacts={contacts}
            loading={loading}
            total={total}
            hasMore={contacts.length < total}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
            onOpen={openContact}
            selected={allFilteredSelected ? new Set(contacts.map((c) => c.id)) : selected}
            onToggleSelect={toggleSelect}
            onToggleSelectPage={toggleSelectPage}
            hasFilters={hasFilters}
          />
        </section>

        {selectionActive && (
          <BulkActionsBar
            selectedCount={selected.size}
            filteredTotal={total}
            allFilteredSelected={allFilteredSelected}
            onSelectAllFiltered={() => setAllFilteredSelected(true)}
            onClear={clearSelection}
            tags={tags}
            busy={bulkBusy}
            onAddTag={(name) =>
              runBulk(() => bulkAction({ ...bulkTarget(), action: 'add_tag', tag: name }), (n) => `Tagged ${n} contact${n === 1 ? '' : 's'}`)
            }
            onRemoveTag={(tagId) =>
              runBulk(() => bulkAction({ ...bulkTarget(), action: 'remove_tag', tagId }), (n) => `Removed tag from ${n} contact${n === 1 ? '' : 's'}`)
            }
            onSetStatus={(status: InviteStatus) =>
              runBulk(() => bulkAction({ ...bulkTarget(), action: 'set_status', status }), (n) => `Updated ${n} contact${n === 1 ? '' : 's'}`)
            }
            onDelete={async () => {
              const n = allFilteredSelected ? total : selected.size
              const ok = await confirm({
                title: `Delete ${n} contact${n === 1 ? '' : 's'}?`,
                message: 'They will be removed from your list permanently.',
                confirmText: 'Delete',
                variant: 'destructive',
              })
              if (!ok) return
              await runBulk(() => bulkAction({ ...bulkTarget(), action: 'delete' }), (k) => `Deleted ${k} contact${k === 1 ? '' : 's'}`)
            }}
            onExportCsv={() => doExportCsv(bulkTarget())}
            onCopyEmails={() => doCopyEmails(bulkTarget())}
          />
        )}
      </div>

      <ContactDrawer
        contact={active}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        tagSuggestions={tags}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
      <ManageTagsDialog
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        tags={tags}
        onTagsChanged={(next) => {
          setTags(next)
          void load({ silent: true })
        }}
      />
    </div>
  )
}
