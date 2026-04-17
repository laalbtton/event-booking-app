'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Save, Mail, Calendar, Clock, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type Template = {
  key: string
  subject: string
  intro: string | null
  footer: string | null
  updated_at: string
  updated_by: string | null
}

const TEMPLATE_META: Record<string, { label: string; description: string; icon: React.ReactNode; variables: string[] }> = {
  weekly_digest: {
    label: 'Weekly Sunday Digest',
    description: 'Sent every Sunday morning to community members with upcoming events in the next 14 days. Skipped if no events are scheduled.',
    icon: <Calendar className="h-5 w-5 text-violet-600" />,
    variables: ['{{user_name}}'],
  },
  pre_event_reminder: {
    label: '48-Hour Pre-Event Reminder',
    description: 'Sent to confirmed attendees and performers exactly 48 hours before their registered event starts.',
    icon: <Clock className="h-5 w-5 text-emerald-600" />,
    variables: ['{{user_name}}', '{{event_title}}', '{{event_date}}', '{{venue_name}}'],
  },
}

const DEFAULTS: Record<string, { subject: string; intro: string; footer: string }> = {
  weekly_digest: {
    subject: "What's on this week 🎤",
    intro: "Here's a look at what's coming up across your communities in the next 14 days. We hope to see you at a show!",
    footer: 'See you at the show! 🎭',
  },
  pre_event_reminder: {
    subject: 'Your event is in 48 hours 🎤',
    intro: "Just a friendly reminder that you're registered for an upcoming event. We're looking forward to seeing you there!",
    footer: 'Break a leg! 🎭',
  },
}

function TemplateEditor({ template, onSaved }: { template: Template; onSaved: () => void }) {
  const meta = TEMPLATE_META[template.key]
  const defaults = DEFAULTS[template.key] ?? { subject: '', intro: '', footer: '' }

  const [subject, setSubject] = useState(template.subject || defaults.subject)
  const [intro, setIntro] = useState(template.intro || defaults.intro)
  const [footer, setFooter] = useState(template.footer || defaults.footer)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const isDirty =
    subject !== (template.subject || defaults.subject) ||
    intro !== (template.intro || defaults.intro) ||
    footer !== (template.footer || defaults.footer)

  async function handleSave() {
    setSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch('/api/email-templates', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ key: template.key, subject, intro, footer }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to save')
      }
      toast.success('Template saved')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setSubject(defaults.subject)
    setIntro(defaults.intro)
    setFooter(defaults.footer)
  }

  const updatedAt = template.updated_at
    ? new Date(template.updated_at).toLocaleDateString('en-CA', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {meta?.icon}
            <div>
              <CardTitle className="text-base">{meta?.label ?? template.key}</CardTitle>
              {updatedAt && (
                <p className="text-xs text-muted-foreground mt-0.5">Last edited {updatedAt}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isDirty && <Badge variant="outline" className="text-amber-600 border-amber-400">Unsaved changes</Badge>}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(v => !v)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <CardDescription className="mt-1">{meta?.description}</CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5 pt-0">
          {/* Available variables */}
          {meta?.variables && meta.variables.length > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800 space-y-1">
              <p className="font-medium">Available variables (click to copy):</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {meta.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="font-mono text-xs bg-blue-100 px-2 py-0.5 rounded hover:bg-blue-200 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(v).catch(() => {})
                      toast.success(`Copied ${v}`)
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor={`${template.key}-subject`}>Email subject line</Label>
            <Input
              id={`${template.key}-subject`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={defaults.subject}
            />
          </div>

          {/* Intro */}
          <div className="space-y-1.5">
            <Label htmlFor={`${template.key}-intro`}>Opening paragraph</Label>
            <Textarea
              id={`${template.key}-intro`}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder={defaults.intro}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Shown at the top of the email body, right below the greeting.
            </p>
          </div>

          {/* Footer */}
          <div className="space-y-1.5">
            <Label htmlFor={`${template.key}-footer`}>Sign-off note</Label>
            <Input
              id={`${template.key}-footer`}
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder={defaults.footer}
            />
            <p className="text-xs text-muted-foreground">
              Shown at the very bottom of the email, below the main content.
            </p>
          </div>

          {/* Preview panel */}
          <div>
            <button
              type="button"
              onClick={() => setShowPreview(v => !v)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? 'Hide preview' : 'Show text preview'}
            </button>
            {showPreview && (
              <div className="mt-3 rounded-lg border p-4 bg-gray-50 space-y-2 text-sm">
                <p className="font-medium text-muted-foreground uppercase tracking-wide text-xs">Subject</p>
                <p className="font-semibold">{subject || defaults.subject}</p>
                <hr />
                <p className="font-medium text-muted-foreground uppercase tracking-wide text-xs mt-3">Opening paragraph</p>
                <p className="text-gray-700 leading-relaxed">{intro || defaults.intro}</p>
                <p className="text-gray-400 italic text-xs">… event listings appear here …</p>
                <hr />
                <p className="font-medium text-muted-foreground uppercase tracking-wide text-xs mt-3">Sign-off</p>
                <p className="text-gray-600">{footer || defaults.footer}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={saving}
              className="text-muted-foreground"
            >
              Reset to defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  async function loadTemplates() {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const res = await fetch('/api/email-templates', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (res.ok) {
      const json = await res.json()
      setTemplates(json.templates ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadTemplates()
  }, [])

  // Ensure all known template keys exist (even if DB row is missing yet)
  const knownKeys = Object.keys(TEMPLATE_META)
  const filledTemplates = knownKeys.map((key) => {
    const found = templates.find((t) => t.key === key)
    return found ?? {
      key,
      subject: DEFAULTS[key]?.subject ?? '',
      intro: DEFAULTS[key]?.intro ?? null,
      footer: DEFAULTS[key]?.footer ?? null,
      updated_at: '',
      updated_by: null,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-5 w-5 text-gray-700" />
          <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Customise the subject line, opening paragraph, and sign-off for automated community emails.
          The overall layout and event listings are managed in code.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filledTemplates.map((t) => (
            <TemplateEditor
              key={t.key}
              template={t as Template}
              onSaved={loadTemplates}
            />
          ))}
        </div>
      )}

      {/* Info panel */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
        <p className="font-semibold">How scheduling works</p>
        <ul className="list-disc list-inside space-y-1 text-amber-700">
          <li><strong>Weekly digest</strong> — fires every Sunday at 9:00 AM UTC. Skipped if no events are upcoming in any community.</li>
          <li><strong>48-hour reminder</strong> — scheduled automatically when an event is created or updated. Cancelled if the event is cancelled.</li>
          <li>Both are powered by Inngest — you can view runs in the <a href="https://app.inngest.com" target="_blank" rel="noopener noreferrer" className="underline">Inngest dashboard</a>.</li>
        </ul>
      </div>
    </div>
  )
}
