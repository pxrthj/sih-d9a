import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useScans } from '../hooks/useScans'
import { Banner, EmptyState, Spinner } from '../components/ui'
import { MapPinIcon } from '../components/Icons'
import { formatDateShort, scanTitle, violationCount } from '../lib/format'
import type { ScanRecord } from '../lib/types'

// Mirrors --success and --error in index.css. Leaflet needs real colour values
// rather than CSS variables, so these are duplicated deliberately; change them
// with the tokens.
const COMPLIANT = '#166534'
const FLAGGED = '#991b1b'

// Roughly the whole country, for the first paint before any record is placed.
const INDIA_CENTER: L.LatLngExpression = [22.35, 78.67]
const INDIA_ZOOM = 4

function isFlagged(scan: ScanRecord): boolean {
  return (scan.status || '').toLowerCase() !== 'compliant'
}

/**
 * Builds a marker's popup as real DOM rather than an HTML string.
 *
 * The product name comes from a model reading a photograph, so it is untrusted
 * text: it is set with textContent, never interpolated into markup.
 */
function popupFor(scan: ScanRecord, onOpen: () => void): HTMLElement {
  const el = document.createElement('div')
  el.className = 'mappop'

  const title = document.createElement('div')
  title.className = 'mappop__title'
  title.textContent = scanTitle(scan.extracted)
  el.appendChild(title)

  const meta = document.createElement('div')
  meta.className = 'mappop__meta'
  const vc = violationCount(scan)
  meta.textContent = [
    isFlagged(scan) ? 'Flagged' : 'Compliant',
    vc > 0 ? `${vc} violation${vc === 1 ? '' : 's'}` : null,
    scan.created_at ? formatDateShort(scan.created_at) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  el.appendChild(meta)

  const btn = document.createElement('button')
  btn.className = 'mappop__link'
  btn.type = 'button'
  btn.textContent = 'View record'
  btn.addEventListener('click', onOpen)
  el.appendChild(btn)

  return el
}

/**
 * Where inspections happened, for an admin.
 *
 * Every scan already carries the coordinates its officer's device reported, so
 * this screen reads existing records rather than collecting anything new.
 *
 * Markers, not a heat layer: at the volumes this system actually holds, a heat
 * map smears a few dozen records into a blur that implies density nobody
 * measured. One dot per inspection, coloured by verdict, is the honest picture.
 */
export default function InspectionMap() {
  const { scans, loading, error } = useScans()
  const navigate = useNavigate()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const pointsRef = useRef<L.LatLngTuple[]>([])
  const fittedRef = useRef(false)

  /**
   * Frame the map on the records, once the container is actually measurable.
   *
   * The guard is the whole point. On first paint the panel has not been laid
   * out, so Leaflet measures a zero-width box — and fitting to a zero-width
   * viewport picks the minimum zoom, dropping the map to whole-world with every
   * marker stacked on one pixel. Bailing out here leaves the fit to the resize
   * observer below, which fires as soon as the real width exists.
   */
  const fitToRecords = useCallback(() => {
    const map = mapRef.current
    if (!map || pointsRef.current.length === 0) return
    if (map.getSize().x === 0) return

    map.invalidateSize()
    // maxZoom stops a single record filling the screen at street level, which
    // reads as precision the fix does not have.
    map.fitBounds(L.latLngBounds(pointsRef.current).pad(0.25), { maxZoom: 15 })
    fittedRef.current = true
  }, [])

  // Location is optional by design — an officer can refuse the permission, and
  // records predating the location columns have none. Those scans are counted
  // and named rather than silently dropped, so the map never reads as the whole
  // picture when it isn't.
  const located = useMemo(
    () => scans.filter((s) => s.latitude != null && s.longitude != null),
    [scans],
  )
  const missing = scans.length - located.length
  const flaggedCount = useMemo(() => located.filter(isFlagged).length, [located])

  // Create the map once. The cleanup matters: React StrictMode mounts effects
  // twice in development, and Leaflet throws on a container it already owns.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      scrollWheelZoom: true,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // Required by the OpenStreetMap tile usage policy.
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    markersRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // Leaflet caches the container's size, so it has to be told when the box
    // changes — a window resize leaves the tiles offset from the pointer
    // otherwise. This also delivers the container's first real width, which is
    // when the initial fit becomes possible.
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
      // Only while the records have never been framed: after that the view is
      // the admin's, and a resize must not yank it back.
      if (!fittedRef.current) fitToRecords()
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      markersRef.current = null
    }
  }, [fitToRecords])

  // Redraw whenever the records change.
  useEffect(() => {
    const map = mapRef.current
    const layer = markersRef.current
    if (!map || !layer) return

    layer.clearLayers()
    fittedRef.current = false

    if (located.length === 0) {
      pointsRef.current = []
      map.setView(INDIA_CENTER, INDIA_ZOOM)
      return
    }

    const points: L.LatLngTuple[] = []

    for (const scan of located) {
      const point: L.LatLngTuple = [scan.latitude as number, scan.longitude as number]
      points.push(point)

      L.circleMarker(point, {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: isFlagged(scan) ? FLAGGED : COMPLIANT,
        fillOpacity: 0.9,
      })
        .bindPopup(popupFor(scan, () => navigate(`/scan/${scan.id}`)))
        .addTo(layer)
    }

    pointsRef.current = points
    fitToRecords()
  }, [located, navigate, fitToRecords])

  return (
    <div className="stack">
      <div className="flex-between">
        <div>
          <h1 className="headline">Inspection map</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            Where records were captured, across all officers
          </div>
        </div>
      </div>

      {error && <Banner kind="error">Couldn’t load scans: {error}</Banner>}

      {!loading && missing > 0 && (
        <Banner kind="info">
          <strong>
            {missing} of {scans.length} inspection{scans.length === 1 ? '' : 's'} {missing === 1 ? 'is' : 'are'} not
            shown.
          </strong>{' '}
          Capture location is optional — these records were saved without one, either because the
          officer declined the permission or the device had no fix.
        </Banner>
      )}

      <div className="map-panel">
        <div className="map-legend">
          <span className="map-legend__item">
            <span className="map-legend__dot" style={{ background: COMPLIANT }} />
            Compliant · {located.length - flaggedCount}
          </span>
          <span className="map-legend__item">
            <span className="map-legend__dot" style={{ background: FLAGGED }} />
            Flagged · {flaggedCount}
          </span>
        </div>

        {/* The container is always mounted: Leaflet measures it on creation, so
            swapping it out for a loader would give the map a zero-size box. */}
        <div ref={containerRef} className="map-canvas" />

        {loading && (
          <div className="map-overlay">
            <Spinner dark />
          </div>
        )}

        {!loading && located.length === 0 && (
          <div className="map-overlay map-overlay--solid">
            <EmptyState
              icon={<MapPinIcon size={44} />}
              title="No located inspections yet"
              text={
                scans.length > 0
                  ? 'Records exist, but none of them carry capture coordinates.'
                  : 'Once officers run scans with location enabled, they appear here.'
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
