import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createScan, uploadEvidencePhoto } from '../lib/api'
import { MAX_LABEL_IMAGES, type CaptureCoords } from '../lib/types'
import { Banner } from '../components/ui'
import { CameraIcon, MapPinIcon, ScanIcon } from '../components/Icons'

// Product categories the officer can tag a scan with. All categories run the
// same 8 Legal Metrology rules today; this list is for classification/record.
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
// exist for packs that carry declarations on more than two panels, or for a
// close-up of a small print block.
const SLOT_HINTS = ['Front', 'Back', 'Side / base', 'Close-up'] as const

interface CaptureTileProps {
  label: string
  file: File
  onReplace: (file: File | null) => void
  onRemove: () => void
}

function CaptureTile({ label, file, onReplace, onRemove }: CaptureTileProps) {
  // Derive an object URL for the preview; revoke it when the file changes/unmounts.
  const preview = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => {
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  return (
    <div className="capture capture--filled">
      <span className="capture__badge">{label}</span>
      <img className="capture__preview" src={preview} alt={`${label} preview`} />
      <label className="capture__change" style={{ cursor: 'pointer' }}>
        Change
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          onChange={(e) => onReplace(e.target.files?.[0] ?? null)}
        />
      </label>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.92)',
          color: 'var(--compliance-error, #991B1B)',
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  )
}

function AddTile({ label, onPick }: { label: string; onPick: (file: File | null) => void }) {
  return (
    <label className="capture">
      <span className="capture__badge">{label}</span>
      <span className="capture__hint">
        <CameraIcon size={26} />
        Tap to add photo
      </span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}

/** A quiet line telling the officer whether the scan's location was captured. */
function LocationNote({
  status,
  coords,
  onRetry,
}: {
  status: 'locating' | 'ok' | 'denied' | 'unavailable'
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
  const tone = status === 'ok' ? 'var(--compliance-ok, #166534)' : 'var(--muted, #6b7280)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: tone, marginTop: 10 }}>
      <MapPinIcon size={16} />
      <span>{text}</span>
      {(status === 'denied' || status === 'unavailable') && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'var(--primary-deep, #002045)',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          Try again
        </button>
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
  const [stage, setStage] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState<CaptureCoords | null>(null)
  const [locStatus, setLocStatus] = useState<'locating' | 'ok' | 'denied' | 'unavailable'>(
    'locating',
  )

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

  // Ask for location when the scan screen opens, so the browser's permission
  // prompt is separate from tapping "Scan".
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
      <div className="center-screen" style={{ flexDirection: 'column', gap: 20, minHeight: '60vh' }}>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 22,
            background: 'var(--primary-deep)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
          }}
        >
          <ScanIcon size={34} />
          <span
            className="spinner"
            style={{ position: 'absolute', width: 76, height: 76, borderWidth: 3 }}
          />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="title-lg">Analysing package</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
            {stage}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div>
        <h1 className="headline">New Scan</h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Capture every panel that carries a declaration, for a Legal Metrology compliance check.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div>
        <div className="flex-between" style={{ marginBottom: 10 }}>
          <div className="section-label" style={{ margin: 0 }}>
            Package photos
          </div>
          <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
            {photos.length} of {MAX_LABEL_IMAGES}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              label={photos.length === 0 ? 'Front' : `Add ${SLOT_HINTS[photos.length] ?? 'photo'}`}
              onPick={addPhoto}
            />
          )}
        </div>

        <p className="help">
          One photo is enough to scan, but a declaration on a panel you don&rsquo;t photograph is
          reported as missing. Add up to {MAX_LABEL_IMAGES} &mdash; and if the MRP, use-by date and
          lot number are crammed into one tiny box, add a close-up of it.
        </p>

        <LocationNote status={locStatus} coords={coords} onRetry={captureLocation} />
      </div>

      <div>
        <label className="label" htmlFor="category">
          Product Category
        </label>
        <select
          id="category"
          className="select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="help">
          All categories currently run the same Legal Metrology checks; category is recorded with
          each scan.
        </p>
      </div>

      <button className="btn btn--primary btn--block" disabled={!canSubmit} onClick={handleScan}>
        <ScanIcon size={20} /> Scan for Compliance
      </button>
    </div>
  )
}
