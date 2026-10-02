'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/dateUtils'
import {
  deleteRecapPhoto,
  fetchRecapPhotos,
  MAX_RECAP_PHOTOS_PER_POST,
  RECAP_BUCKET,
  RECAP_POST_DELAY_HOURS,
  saveRecapCaption,
  saveRecapPhotoRecords,
  uploadRecapPhotoFile,
  validateRecapPhotoFile,
  type RecapPhotosResponse,
} from '@/lib/recapPhotos'
import { supabase } from '@/lib/supabase'
import type { EventRecapPhoto } from '@/lib/supabase'

type EventRecapPhotosProps = {
  eventId: string
}

export default function EventRecapPhotos({ eventId }: EventRecapPhotosProps) {
  const [data, setData] = useState<RecapPhotosResponse | null>(null)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [savingCaption, setSavingCaption] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const result = await fetchRecapPhotos(eventId)
      setData(result)
      setCaption(result.caption || '')
      setVisible(true)
    } catch {
      setVisible(false)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !data) return
    const remaining = MAX_RECAP_PHOTOS_PER_POST - data.photos.length
    if (remaining <= 0) {
      toast.error(`You can queue up to ${MAX_RECAP_PHOTOS_PER_POST} photos`)
      return
    }

    const selected = Array.from(files).slice(0, remaining)
    setUploading(true)
    const uploaded: Array<{ storagePath: string; publicUrl: string }> = []
    try {
      for (const file of selected) {
        const invalid = validateRecapPhotoFile(file)
        if (invalid) {
          toast.error(`${file.name}: ${invalid}`)
          continue
        }
        uploaded.push(await uploadRecapPhotoFile(eventId, file))
      }
      if (uploaded.length === 0) return
      try {
        const saved = await saveRecapPhotoRecords(eventId, uploaded)
        setData((prev) =>
          prev
            ? { ...prev, photos: [...prev.photos, ...(saved.photos || [])] }
            : prev
        )
        toast.success(
          uploaded.length === 1 ? 'Photo added to the recap queue' : `${uploaded.length} photos added to the recap queue`
        )
      } catch (saveError) {
        await supabase.storage.from(RECAP_BUCKET).remove(uploaded.map((photo) => photo.storagePath))
        throw saveError
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload recap photos')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemove(photo: EventRecapPhoto) {
    setRemovingId(photo.id)
    try {
      await deleteRecapPhoto(eventId, photo.id)
      setData((prev) =>
        prev ? { ...prev, photos: prev.photos.filter((item) => item.id !== photo.id) } : prev
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove photo')
    } finally {
      setRemovingId(null)
    }
  }

  async function handleSaveCaption() {
    setSavingCaption(true)
    try {
      const result = await saveRecapCaption(eventId, caption)
      setCaption(result.caption)
      toast.success('Caption saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save caption')
    } finally {
      setSavingCaption(false)
    }
  }

  if (loading || !visible || !data) return null

  const remaining = Math.max(0, MAX_RECAP_PHOTOS_PER_POST - data.photos.length)
  const readyAt = new Date(data.postReadyAt)
  const waiting = Date.now() < readyAt.getTime()

  return (
    <Card className="mb-6 rounded-none sm:rounded-lg border-x-0 sm:border-x">
      <CardHeader>
        <CardTitle className="text-lg">Event recap photos</CardTitle>
        <CardDescription>
          Drop performer photos here instead of WhatsApp. We post them to Instagram
          {data.photos.length === 1 ? ' as a single image' : ' as a carousel'} {RECAP_POST_DELAY_HOURS} hours after the
          event ends, then delete them from the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-700">
          {waiting
            ? `Scheduled to post ${formatDateTime(readyAt)}.`
            : data.photos.length > 0
              ? 'Event is over — these photos will post on the next hourly check.'
              : 'Event is over. Add photos and they will post on the next hourly check.'}
        </p>

        {data.canManage && !data.instagramConnected && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            Connect Instagram in{' '}
            <Link href="/settings/instagram" className="font-semibold underline">
              Settings
            </Link>{' '}
            so the host account can auto-post this recap.
          </div>
        )}

        {data.photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {data.photos.map((photo) => (
              <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.public_url} alt="Recap photo" className="h-32 w-full object-cover" />
                {photo.status !== 'posting' && (
                  <button
                    type="button"
                    onClick={() => handleRemove(photo)}
                    disabled={removingId === photo.id}
                    className="absolute top-1 right-1 rounded-full bg-black/70 p-1.5 text-white hover:bg-black"
                    aria-label="Remove photo"
                  >
                    {removingId === photo.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {photo.status === 'posting' && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    Posting
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />

        <Button
          type="button"
          variant="outline"
          disabled={uploading || remaining <= 0}
          onClick={() => fileInputRef.current?.click()}
          className="gap-2"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {remaining <= 0 ? 'Photo limit reached' : uploading ? 'Uploading…' : 'Add photos'}
        </Button>
        <p className="text-xs text-gray-500">
          JPEG or PNG, up to 8MB each. {remaining} of {MAX_RECAP_PHOTOS_PER_POST} slots left.
        </p>

        {data.canManage && (
          <div className="space-y-2">
            <label htmlFor="recap-caption" className="font-semibold text-gray-900 text-sm">
              Instagram caption
            </label>
            <Textarea
              id="recap-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              rows={4}
              maxLength={2200}
              placeholder="Leave blank to use the event title, date, and location."
              className="text-gray-900 bg-white"
            />
            <Button type="button" size="sm" onClick={() => void handleSaveCaption()} disabled={savingCaption}>
              {savingCaption ? 'Saving…' : 'Save caption'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
