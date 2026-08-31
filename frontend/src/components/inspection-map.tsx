import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useNavigate } from 'react-router-dom'
import type { ScanRecord } from '@/lib/types'
import { formatDateShort, scanTitle, violationCount } from '@/lib/format'

/**
 * Where inspections were carried out.
 *
 * Scans already record the device's coordinates at capture time; until now they
 * were only printed on the notice. Plotted together they answer a supervisory
 * question the list cannot: which markets have actually been covered, and where
 * the flagged packages are clustered.
 *
 * Leaflet is driven imperatively here rather than through a React wrapper — the
 * map is one self-contained widget, and one dependency is cheaper than two.
 */
export function InspectionMap({ scans, className }: { scans: ScanRecord[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const navigate = useNavigate()

  // Create the map once; markers are refreshed separately as scans load.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([22.9734, 78.6569], 4) // India, before any pins are known

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    // `0,0` is a real coordinate, so test for null rather than falsiness.
    const located = scans.filter((s) => s.latitude != null && s.longitude != null)
    if (located.length === 0) return

    for (const scan of located) {
      const flagged = (scan.status || '').toLowerCase() !== 'compliant'
      const colour = flagged ? '#991b1b' : '#166534'
      const count = violationCount(scan)

      const marker = L.circleMarker([scan.latitude as number, scan.longitude as number], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: colour,
        fillOpacity: 0.9,
      })

      // Titles come from extracted label text, so they are escaped before they
      // reach the popup's HTML.
      const title = escapeHtml(scanTitle(scan.extracted))
      const meta = escapeHtml(
        `${formatDateShort(scan.created_at)}${count > 0 ? ` · ${count} violation${count === 1 ? '' : 's'}` : ''}`,
      )
      marker.bindPopup(
        `<div style="font-size:13px;line-height:1.5">
           <strong>${title}</strong><br />
           <span style="color:${colour}">${flagged ? 'Flagged' : 'Compliant'}</span> · ${meta}
         </div>`,
      )
      marker.on('click', () => navigate(`/scan/${scan.id}`))
      marker.addTo(layer)
    }

    const bounds = L.latLngBounds(
      located.map((s) => [s.latitude as number, s.longitude as number] as [number, number]),
    )
    // A single pin has zero-area bounds, which fitBounds would zoom to maximum.
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: located.length === 1 ? 14 : 16 })
  }, [scans, navigate])

  return <div ref={containerRef} className={className} />
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
