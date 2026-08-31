import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Inbox } from 'lucide-react'
import { fetchVerification } from '@/lib/api'
import type { Verification } from '@/lib/types'
import { AdvisoryList, Field, VerdictBanner, ViolationList } from '@/components/ScanResult'
import { AppBar } from '@/components/Layout'
import { EmptyState } from '@/components/empty-state'
import { SectionLabel, Spinner } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

/**
 * Public verification of an issued Improvement Notice.
 *
 * Reached by scanning the QR printed on the notice, with no sign-in. It shows
 * the verdict held in the inspection record so that a printed document can be
 * checked against its source — records cannot be altered after creation, so a
 * discrepancy means the paper was modified.
 */
export default function Verify() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Verification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchVerification(id)
      .then((v) => active && setData(v))
      .catch(
        (e: unknown) =>
          active && setError(e instanceof Error ? e.message : 'Could not verify this notice.'),
      )
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  return (
    <div className="bg-background min-h-screen">
      <AppBar subtitle="Notice verification" />

      <main className="app-column space-y-5 px-5 pt-5 pb-12">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="text-muted-foreground size-6" />
          </div>
        ) : error || !data ? (
          <Card>
            <EmptyState
              icon={Inbox}
              title="No matching record"
              text={
                error ??
                'No inspection record matches this reference. If this code came from a printed notice, that notice may not be genuine.'
              }
            />
          </Card>
        ) : (
          <>
            <div>
              <SectionLabel>Notice reference</SectionLabel>
              <h1 className="mt-1 font-mono text-xl font-semibold tracking-tight">
                {data.notice_ref}
              </h1>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Inspected {data.inspection_date} by {data.officer_name}
              </p>
            </div>

            <VerdictBanner
              status={data.status}
              violationCount={data.violations.length}
              label="Verified compliance verdict"
            />

            <p className="text-muted-foreground text-xs leading-relaxed">
              This is the verdict held in the inspection record. If the printed notice says anything
              different, the printed notice has been altered.
            </p>

            <Card>
              <dl>
                <Field label="Commodity" value={data.product_name}>
                  {data.product_name ? undefined : (
                    <span className="text-muted-foreground italic">Not declared on package</span>
                  )}
                </Field>
                <Field label="Manufacturer / packer / importer" value={data.manufacturer}>
                  {data.manufacturer ? undefined : (
                    <span className="text-muted-foreground italic">Not declared on package</span>
                  )}
                </Field>
                <Field label="Category" value={data.category} />
              </dl>
            </Card>

            <section className="space-y-2">
              <SectionLabel>Declared contraventions</SectionLabel>
              {data.violations.length === 0 ? (
                <Card className="flex-row items-center gap-3 p-4">
                  <Badge variant="success">
                    <CheckCircle2 />
                    None recorded
                  </Badge>
                </Card>
              ) : (
                <ViolationList violations={data.violations} />
              )}
            </section>

            <AdvisoryList advisories={data.advisories} />

            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              Inspection records are immutable — they cannot be edited or deleted once created.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
