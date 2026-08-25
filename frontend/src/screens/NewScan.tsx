import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createScan, uploadEvidencePhoto } from '../lib/api'
import { Banner } from '../components/ui'
import { CameraIcon, ScanIcon } from '../components/Icons'

interface CaptureTileProps {
  label: string
  file: File | null
  onPick: (file: File | null) => void
}

function CaptureTile({ label, file, onPick }: CaptureTileProps) {
  // Derive an object URL for the preview; revoke it when the file changes/unmounts.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  return (
    <label className={`capture ${file ? 'capture--filled' : ''}`}>
      <span className="capture__badge">{label}</span>
      {file && preview ? (
        <>
          <img className="capture__preview" src={preview} alt={`${label} preview`} />
          <span className="capture__change">Change</span>
        </>
      ) : (
        <span className="capture__hint">
          <CameraIcon size={26} />
          Tap to add photo
        </span>
      )}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}

export default function NewScan() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [category, setCategory] = useState('General')
  const [submitting, setSubmitting] = useState(false)
  const [stage, setStage] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !!front && !!back && !!user && !submitting

  async function handleScan() {
    if (!front || !back || !user) return
    setSubmitting(true)
    setError(null)
    try {
      setStage('Uploading package photos…')
      const [frontPath, backPath] = await Promise.all([
        uploadEvidencePhoto(front),
        uploadEvidencePhoto(back),
      ])

      setStage('Extracting declarations & checking rules…')
      const result = await createScan({ frontPath, backPath, userId: user.id })

      navigate('/results', { state: { result } })
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
          Capture both sides of the package for a Legal Metrology compliance check.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div>
        <div className="section-label">Package photos</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <CaptureTile label="Front" file={front} onPick={setFront} />
          <CaptureTile label="Back" file={back} onPick={setBack} />
        </div>
        <p className="help">Front and back are both required. Photos are stored as inspection evidence.</p>
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
          <option value="General">General</option>
        </select>
        <p className="help">More category-specific rule sets will be added over time.</p>
      </div>

      <button className="btn btn--primary btn--block" disabled={!canSubmit} onClick={handleScan}>
        <ScanIcon size={20} /> Scan for Compliance
      </button>
    </div>
  )
}
