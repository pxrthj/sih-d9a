import { useState } from 'react'
import { Camera, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import type { Advisory, ExtractedData, Violation } from '@/lib/types'
import { fieldLabel, mrpText, netQuantityText } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Suggested purpose of each capture slot, mirrored from the scan screen. */
const PHOTO_LABELS = ['Front', 'Back', 'Side / base', 'Close-up']

function EvidenceTile({ label, url }: { label: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  const showImage = !!url && !failed

  return (
    <div className="bg-muted relative aspect-4/3 overflow-hidden rounded-lg border">
      <Badge variant="secondary" className="absolute top-2 left-2 z-10">
        {label}
      </Badge>
      {showImage ? (
        <img
          src={url}
          alt={label}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 text-xs">
          <Camera className="size-5" />
          {url ? 'Image unavailable' : 'No photo'}
        </div>
      )}
    </div>
  )
}

/** Every evidence photo for a record, read-only, in capture order. */
export function EvidencePhotos({ urls }: { urls: string[] }) {
  const tiles = urls.length > 0 ? urls : [null]
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((url, i) => (
        <EvidenceTile key={url ?? i} label={PHOTO_LABELS[i] ?? `Photo ${i + 1}`} url={url} />
      ))}
    </div>
  )
}

export function VerdictBanner({
  status,
  violationCount,
  label = 'Compliance verdict',
}: {
  status?: string | null
  violationCount: number
  label?: string
}) {
  const compliant = (status || '').toLowerCase() === 'compliant'
  const Icon = compliant ? CheckCircle2 : TriangleAlert

  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        compliant
          ? 'bg-success-muted border-success/20 text-success'
          : 'bg-destructive-muted border-destructive/20 text-destructive',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium tracking-wide uppercase opacity-80">{label}</div>
          <div className="mt-1 text-2xl font-semibold capitalize">{status || 'Unknown'}</div>
        </div>
        <Icon className="size-7 shrink-0 opacity-90" />
      </div>
      <p className="mt-3 text-sm leading-relaxed opacity-90">
        {compliant
          ? 'All mandatory Legal Metrology declarations were detected.'
          : `${violationCount} mandatory ${violationCount === 1 ? 'declaration is' : 'declarations are'} missing or non-compliant.`}
      </p>
    </div>
  )
}

/** One row of the extracted-declarations list. */
export function Field({
  label,
  value,
  children,
}: {
  label: string
  value?: string | null
  children?: React.ReactNode
}) {
  const empty = !children && (value == null || value.trim() === '')
  return (
    <div className="border-t px-5 py-3 first:border-t-0">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className={cn('mt-1 text-sm leading-relaxed', empty && 'text-muted-foreground italic')}>
        {children ?? (empty ? 'Not detected on label' : value)}
      </dd>
    </div>
  )
}

/** How a reported declaration language reads to an officer (Rule 9(4)). */
const LANGUAGE_TEXT: Record<string, string> = {
  english: 'English',
  hindi: 'Hindi (Devanagari)',
  both: 'Hindi and English',
  other: 'Neither Hindi nor English',
}

export function ExtractedFields({ extracted }: { extracted: ExtractedData | null }) {
  if (!extracted) {
    return <p className="text-muted-foreground text-sm">No extracted data available.</p>
  }

  const nq = netQuantityText(extracted)
  const mrp = mrpText(extracted)
  const language = extracted.declaration_language?.trim().toLowerCase()
  // Only imported packs must declare an origin (Rule 6(1)(aa)), so the row is
  // hidden on packs that don't present as imported — it would read as a defect.
  const showOrigin = extracted.import_declared === true || !!extracted.country_of_origin

  return (
    <Card>
      <dl>
        <Field label="Product name" value={extracted.product_name} />
        <Field
          label="Manufacturer / packer / importer"
          value={extracted.manufacturer_packer_importer}
        />
        {showOrigin && <Field label="Country of origin" value={extracted.country_of_origin} />}
        <Field label="Net quantity" value={nq} />
        <Field label="Maximum retail price (MRP)" value={mrp}>
          {mrp ? (
            <span className="flex flex-wrap items-center gap-2">
              {mrp}
              <Badge variant={extracted.mrp?.inclusive_of_taxes_stated ? 'secondary' : 'warning'}>
                {extracted.mrp?.inclusive_of_taxes_stated
                  ? 'Incl. of all taxes stated'
                  : 'Tax-inclusive not stated'}
              </Badge>
            </span>
          ) : undefined}
        </Field>
        <Field label="Mfg / pack date" value={extracted.mfg_or_pack_date} />
        <Field label="Use by / best before" value={extracted.use_by_date} />
        <Field label="Lot / batch number" value={extracted.lot_batch_number} />
        <Field label="Consumer care" value={extracted.consumer_care} />
        {language && (
          <Field
            label="Declaration language"
            value={LANGUAGE_TEXT[language] ?? extracted.declaration_language}
          />
        )}
        <Field label="Declarations present">
          {extracted.declarations_present?.length ? (
            <span className="flex flex-wrap gap-1.5">
              {extracted.declarations_present.map((d, i) => (
                <Badge key={`${d}-${i}`} variant="secondary">
                  {fieldLabel(d)}
                </Badge>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground italic">None identified</span>
          )}
        </Field>
      </dl>
    </Card>
  )
}

export function ViolationList({ violations }: { violations: Violation[] | null }) {
  if (!violations || violations.length === 0) {
    return (
      <Card className="flex-row items-center gap-3 p-4">
        <Badge variant="success">
          <CheckCircle2 />
          No violations
        </Badge>
        <span className="text-muted-foreground text-sm">
          The package meets every checked Legal Metrology rule.
        </span>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {violations.map((v, i) => (
        <Card key={`${v.field}-${i}`} className="border-destructive/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-destructive text-sm font-semibold">{fieldLabel(v.field)}</div>
            <Badge variant="destructive" className="font-mono">
              {v.rule_ref}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed">
            {v.issue === 'missing'
              ? 'Mandatory declaration is missing from the package.'
              : v.issue}
          </p>
        </Card>
      ))}
    </div>
  )
}

/**
 * Observations for the officer to verify by hand. These are NOT rule failures
 * and never change the compliance verdict, so they are styled apart from
 * violations and always say so.
 */
export function AdvisoryList({ advisories }: { advisories: Advisory[] | null | undefined }) {
  if (!advisories || advisories.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Observations to verify
      </div>
      <Card className="divide-y p-0">
        {advisories.map((a, i) => (
          <div key={`${a.field}-${i}`} className="flex gap-3 p-4">
            <Info className="text-warning mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm leading-relaxed">{a.issue}</p>
              <Badge variant="outline" className="mt-2 font-mono">
                {a.rule_ref}
              </Badge>
            </div>
          </div>
        ))}
      </Card>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Not violations. These could not be settled from the photographs and need checking against
        the physical package.
      </p>
    </section>
  )
}
