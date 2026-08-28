'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Timer, Wrench } from 'lucide-react'
import type { EventPerformerRoleKey } from '@/lib/supabase'

type RoleHolder = {
  id: string
  fullName: string | null
  avatarUrl: string | null
}

type RoleSlot = {
  roleKey: EventPerformerRoleKey
  label: string
  description: string
  enabled: boolean
  holder: RoleHolder | null
  assignedAt: string | null
  selfClaimed: boolean
}

type RolesState = {
  offersRoles: boolean
  roles: RoleSlot[]
  viewer: {
    canManage: boolean
    isConfirmedPerformer: boolean
    heldRoleKey: EventPerformerRoleKey | null
  }
  performers: RoleHolder[]
}

const ROLE_ICONS: Record<EventPerformerRoleKey, typeof Timer> = {
  time_keeper: Timer,
  setup_wrapup: Wrench,
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

type PerformerRolesCardProps = {
  eventId: string
  /**
   * 'manage' shows the host controls (switches, assignment). 'performer' shows
   * the claim button for the viewer. A host who is also performing sees the
   * manage card on the manage screen and the claim card on the event page.
   */
  mode: 'manage' | 'performer'
  /** Lets the parent refresh its own attendee list after an assignment changes. */
  onChanged?: () => void
}

export default function PerformerRolesCard({ eventId, mode, onChanged }: PerformerRolesCardProps) {
  const [state, setState] = useState<RolesState | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingRole, setPendingRole] = useState<EventPerformerRoleKey | null>(null)
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        setState(null)
        return
      }

      const response = await fetch(`/api/events/${eventId}/performer-roles`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) {
        setState(null)
        return
      }
      setState((await response.json()) as RolesState)
    } catch {
      // A missing roles card is not worth an error toast on page load.
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  async function mutate(
    roleKey: EventPerformerRoleKey,
    body: Record<string, unknown>,
    successMessage?: string,
  ) {
    setPendingRole(roleKey)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch(`/api/events/${eventId}/performer-roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roleKey, ...body }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        // A lost race still returns fresh state, so show what actually happened.
        if (result.state) setState(result.state as RolesState)
        throw new Error(result.error || 'Could not update that role')
      }

      if (result.state) setState(result.state as RolesState)
      if (successMessage) toast.success(successMessage)
      onChanged?.()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not update that role')
    } finally {
      setPendingRole(null)
    }
  }

  if (loading) {
    return mode === 'manage' ? <Skeleton className="h-40 w-full" /> : null
  }

  if (!state?.offersRoles) return null
  if (mode === 'manage' && !state.viewer.canManage) return null
  if (mode === 'performer' && !state.viewer.isConfirmedPerformer) return null

  const heldRoleKey = state.viewer.heldRoleKey

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {mode === 'manage' ? 'Performer roles' : 'Help run the show'}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {mode === 'manage'
            ? 'Optional jobs a confirmed performer can take. First come, first served — turn one off if you would rather handle it yourself. Only you can reassign a role once it is taken.'
            : 'Take on an extra job at this open mic. First come, first served — once taken, only the host can change it.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.roles.map((role) => {
          const Icon = ROLE_ICONS[role.roleKey]
          const isPending = pendingRole === role.roleKey
          const isMine = heldRoleKey === role.roleKey
          const blockedByOtherRole = !!heldRoleKey && heldRoleKey !== role.roleKey

          return (
            <div
              key={role.roleKey}
              className="rounded-lg border border-gray-200 p-3 sm:p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Icon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{role.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                  </div>
                </div>

                {mode === 'manage' ? (
                  <Switch
                    checked={role.enabled}
                    disabled={isPending}
                    aria-label={`Offer ${role.label}`}
                    onCheckedChange={(checked) =>
                      void mutate(
                        role.roleKey,
                        { action: 'set-enabled', enabled: checked },
                        checked ? `${role.label} is now offered.` : `${role.label} turned off.`,
                      )
                    }
                  />
                ) : (
                  <Badge variant={isMine ? 'default' : role.holder ? 'secondary' : 'outline'}>
                    {isMine ? 'You' : role.holder ? 'Taken' : 'Open'}
                  </Badge>
                )}
              </div>

              {!role.enabled ? (
                <p className="text-xs text-muted-foreground">
                  Not offered for this event.
                </p>
              ) : (
                <>
                  {role.holder ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        {role.holder.avatarUrl ? (
                          <AvatarImage src={role.holder.avatarUrl} alt={role.holder.fullName ?? ''} />
                        ) : null}
                        <AvatarFallback className="text-xs">
                          {getInitials(role.holder.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-900 truncate">
                        {role.holder.fullName || 'Unnamed performer'}
                      </span>
                      {!role.selfClaimed && (
                        <span className="text-xs text-muted-foreground">(assigned)</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nobody has taken this yet.</p>
                  )}

                  {mode === 'manage' ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={assignSelection[role.roleKey] ?? ''}
                        disabled={isPending || state.performers.length === 0}
                        onChange={(event) =>
                          setAssignSelection((previous) => ({
                            ...previous,
                            [role.roleKey]: event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          {state.performers.length === 0
                            ? 'No confirmed performers yet'
                            : 'Assign to…'}
                        </option>
                        {state.performers.map((performer) => (
                          <option key={performer.id} value={performer.id}>
                            {performer.fullName || 'Unnamed performer'}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 sm:flex-none"
                          disabled={isPending || !assignSelection[role.roleKey]}
                          onClick={async () => {
                            await mutate(
                              role.roleKey,
                              { action: 'assign', userId: assignSelection[role.roleKey] },
                              `${role.label} assigned.`,
                            )
                            setAssignSelection((previous) => ({ ...previous, [role.roleKey]: '' }))
                          }}
                        >
                          Assign
                        </Button>
                        {role.holder && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 sm:flex-none"
                            disabled={isPending}
                            onClick={() =>
                              void mutate(
                                role.roleKey,
                                { action: 'release' },
                                `${role.label} is open again.`,
                              )
                            }
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : role.holder ? null : (
                    <Button
                      size="sm"
                      disabled={isPending || blockedByOtherRole}
                      onClick={() =>
                        void mutate(role.roleKey, { action: 'claim' }, `You're on ${role.label}.`)
                      }
                    >
                      {blockedByOtherRole ? 'You already have a role' : `I'll do it`}
                    </Button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
