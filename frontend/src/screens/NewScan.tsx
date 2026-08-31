import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, MapPin, ScanLine, TriangleAlert, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { createScan, uploadEvidencePhoto } from '@/lib/api'
import { MAX_LABEL_IMAGES, type CaptureCoords } from '@/lib/types'
import { PageHeader, SectionLabel, Spinner } from '@/components/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Product categories an officer can tag a scan with. Every category runs the
// same Legal Metrology rules today; this is for classification and record.
const PRODUCT_CATEGORIES = [
  'General',
  'Food & Beverages',
  'Personal Care & Cosmetics',
  'Household & Cleaning',
  'Electronics & Appliances',
  'Textiles & Garments',
  'Other',
] as const

// Suggested purpose for each slot. Only the first photo is required — the rest
// exist for packs carrying declarations on more than two panels, or for a
// close-up of a small print block.
const SLOT_HINTS = ['Front', 'Back', 'Side / base', 'Close-up'] as const

function CaptureTile({
  label,
  file,
  onReplace,
  onRemove,
}: {
  label: string
  file: File
  onReplace: (file: File | null) => void
  onRemove: () => void
}) {
  // Derive an object URL for the preview; revoke it when the file changes.
  const preview = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(preview), [preview])

  return (
    <div className="bg-muted relative aspect-4/3 overflow-hidden rounded-lg border">
      <img src={preview} alt={`${label} preview`} className="size-full object-cover" />
      <span className="bg-card/90 absolute top-2 left-2 rounded px-2 py-0.5 text-xs font-medium">
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="bg-card/90 text-destructive absolute top-2 right-2 grid size-6 place-items-center rounded-full"
      >
        <X className="size-3.5" />
      </button>
      <label className="bg-card/90 absolute inset-x-2 bottom-2 cursor-pointer rounded py-1 text-center text-xs font-medium">
        Change
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onReplace(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  )
}

function AddTile({ label, onPick }: { label: string; onPick: (file: File | null) => void }) {
  return (
    <label className="border-input text-muted-foreground hover:border-ring hover:text-foreground flex aspect-4/3 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed transition-colors">
      <Camera className="size-6" />
      <span className="text-xs font-medium">{label}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}

type LocationStatus = 'locating' | 'ok' | 'denied' | 'unavailable'

/** A quiet line telling the officer whether the scan's location was captured. */
function LocationNote({
  status,
  coords,
  onRetry,
}: {
  status: LocationStatus
  coords: CaptureCoords | null
  onRetry: () => void
}) {
  const accuracy = coords?.accuracy != null ? ` · ±${Math.round(coords.accuracy)} m` : ''
  const text =
    status === 'ok' && coords
      ? `Location captured${accuracy}`
      : status === 'locating'
        ? 'Capturing location…'
        : status === 'denied'
          ? 'Location off — the notice won’t show where this was scanned.'
          : 'Location unavailable on this device.'

  return (
    <div className="flex items-center gap-2 text-xs">
      <MapPin className={cn('size-4', status === 'ok' ? 'text-success' : 'text-muted-foreground')} />
      <span className={status === 'ok' ? 'text-success' : 'text-muted-foreground'}>{text}</span>
      {(status === 'denied' || status === 'unavailable') && (
        <Button variant="link" size="sm" className="ml-auto h-auto p-0 text-xs" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export default function NewScan() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [photos, setPhotos] = useState<File[]>([])
  const [category, setCategory] = useState('General')
  const [submitting, setSubmitting] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState<CaptureCoords | null>(null)
  const [locStatus, setLocStatus] = useState<LocationStatus>('locating')

  const canAddMore = photos.length < MAX_LABEL_IMAGES
  const canSubmit = photos.length > 0 && !!user && !submitting

  // Read the device's coordinates. Resolves to null (never rejects) if location
  // is unsupported, denied, or times out — a scan is never blocked on it.
  const captureLocation = useCallback((): Promise<CaptureCoords | null> => {
    if (!('geolocation' in navigator)) {
      setLocStatus('unavailable')
      return Promise.resolve(null)
    }
    setLocStatus('locating')
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c: CaptureCoords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          }
          setCoords(c)
          setLocStatus('ok')
          resolve(c)
        },
        (err) => {
          setLocStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    })
  }, [])

  // Ask for location when the screen opens, so the browser's permission prompt
  // is separate from tapping "Scan".
  useEffect(() => {
    void captureLocation()
  }, [captureLocation])

  function addPhoto(file: File | null) {
    if (!file) return
    setPhotos((prev) => (prev.length >= MAX_LABEL_IMAGES ? prev : [...prev, file]))
  }

  function replacePhoto(index: number, file: File | null) {
    if (!file) return
    setPhotos((prev) => prev.map((p, i) => (i === index ? file : p)))
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleScan() {
    if (photos.length === 0 || !user) return
    setSubmitting(true)
    setError(null)
    try {
      setStage(
        photos.length === 1
          ? 'Uploading package photo…'
          : `Uploading ${photos.length} package photos…`,
      )
      // Upload in parallel, but keep the officer's capture order.
      const imagePaths = await Promise.all(photos.map((file) => uploadEvidencePhoto(file)))

      // Use a fix we already have, else make one last attempt. Never blocks.
      const location = coords ?? (await captureLocation())

      setStage('Extracting declarations & checking rules…')
      const result = await createScan({ imagePaths, userId: user.id, category, coords: location })

      navigate('/results', { state: { result, coords: location } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed. Please try again.')
      setSubmitting(false)
      setStage('')
    }
  }

  if (submitting) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="bg-primary text-primary-foreground grid size-16 place-items-center rounded-2xl">
          <ScanLine className="size-7" />
        </div>
        <div>
          <div className="font-semibold">Analysing package</div>
          <p className="text-muted-foreground mt-1 flex items-center justify-center gap-2 text-sm">
            <Spinner />
            {stage}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New scan"
        description="Capture every panel that carries a declaration, for a Legal Metrology compliance check."
      />

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Package photos</SectionLabel>
          <span className="text-muted-foreground text-xs font-medium tabular-nums">
            {photos.length} of {MAX_LABEL_IMAGES}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {photos.map((file, index) => (
            <CaptureTile
              key={`${file.name}-${file.lastModified}-${index}`}
              label={SLOT_HINTS[index] ?? `Photo ${index + 1}`}
              file={file}
              onReplace={(f) => replacePhoto(index, f)}
              onRemove={() => removePhoto(index)}
            />
          ))}
          {canAddMore && (
            <AddTile
              label={photos.length === 0 ? 'Add front' : `Add ${SLOT_HINTS[photos.length] ?? 'photo'}`}
              onPick={addPhoto}
            />
          )}
        </div>

        <p className="text-muted-foreground text-xs leading-relaxed">
          One photo is enough to scan, but a declaration on a panel you don’t photograph is reported
          as missing. Add up to {MAX_LABEL_IMAGES} — and if the MRP, use-by date and lot number are
          crammed into one tiny box, add a close-up of it.
        </p>

        <LocationNote status={locStatus} coords={coords} onRetry={captureLocation} />
      </section>

      <section className="space-y-2">
        <Label htmlFor="category">Product category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs leading-relaxed">
          All categories currently run the same Legal Metrology checks; the category is recorded
          with each scan.
        </p>
      </section>

      <Button size="lg" className="w-full" disabled={!canSubmit} onClick={handleScan}>
        <ScanLine />
        Scan for compliance
      </Button>
    </div>
  )
}
