import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useScans } from '../hooks/useScans'
import { Banner, EmptyState, Spinner, StatusPill } from '../components/ui'
import { ChevronRight, InboxIcon, SearchIcon } from '../components/Icons'
import { formatDateShort, scanTitle, violationCount } from '../lib/format'

type Filter = 'all' | 'compliant' | 'violations'

export default function History() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const { scans, loading, error } = useScans()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scans.filter((s) => {
      const status = (s.status || '').toLowerCase()
      if (filter === 'compliant' && status !== 'compliant') return false
      if (filter === 'violations' && violationCount(s) === 0) return false
      if (q) {
        const haystack = [
          scanTitle(s.extracted),
          s.extracted?.manufacturer_packer_importer,
          s.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [scans, filter, query])

  return (
    <div className="stack">
      <div>
        <h1 className="headline">Inspections</h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          {isAdmin ? 'System-wide inspection history across all officers.' : 'Your inspection history.'}
        </p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--outline)',
          }}
        >
          <SearchIcon size={18} />
        </span>
        <input
          className="input"
          style={{ paddingLeft: 42 }}
          placeholder="Search by manufacturer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filter tabs */}
      <div className="tabs">
        {(['all', 'compliant', 'violations'] as Filter[]).map((f) => (
          <button
            key={f}
            className={`tab ${filter === f ? 'tab--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'compliant' ? 'Compliant' : 'Violations'}
          </button>
        ))}
      </div>

      {error && <Banner kind="error">Couldn’t load scans: {error}</Banner>}

      {loading ? (
        <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <Spinner dark />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<InboxIcon size={48} />}
            title={scans.length === 0 ? 'No inspections yet' : 'No matching records'}
            text={
              scans.length === 0
                ? 'Completed compliance scans will appear here.'
                : 'Try a different filter or search term.'
            }
          />
        </div>
      ) : (
        <div className="card card--flush">
          <div className="rows">
            {filtered.map((s) => {
              const vc = violationCount(s)
              return (
                <button key={s.id} className="row" onClick={() => navigate(`/scan/${s.id}`)}>
                  <div className="row__body">
                    <div className="row__title">{scanTitle(s.extracted)}</div>
                    <div className="row__meta">
                      {formatDateShort(s.created_at)}
                      {vc > 0 ? ` · ${vc} violation${vc === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  <StatusPill status={s.status} />
                  <ChevronRight className="row__chev" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
