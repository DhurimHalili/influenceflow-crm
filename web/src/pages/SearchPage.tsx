import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { SEARCH_NICHES, getNiche, resolveSearchQueries } from '../lib/niches'
import { Empty, useToast } from '../components/ui'
import { PageHeader, useActivityLogger } from '../components/Layout'

type Tab = 'brands' | 'creators'

type FoundBrand = {
  brand_name: string
  domain: string
  source_creator_id: string | null
  source_creator_name: string
  source_video_url: string
  brand_id?: string
}

type RunProgress = {
  run_id?: string
  status: string
  done?: boolean
  brands_found: number
  target: number
  creators_scanned: number
  youtube_scanned: number
  phase?: string
  results?: FoundBrand[]
  error?: string | null
  niche?: string
  subniche?: string | null
  niche_label?: string
  quota_used_approx?: number
}

const TARGET = 50

export function SearchPage() {
  const { user } = useAuth()
  const log = useActivityLogger()
  const { show, Toast } = useToast()
  const [tab, setTab] = useState<Tab>('brands')
  const [nicheId, setNicheId] = useState('tech')
  const [subnicheId, setSubnicheId] = useState<string | null>('sim-racing-rigs')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [results, setResults] = useState<FoundBrand[]>([])

  const niche = useMemo(() => getNiche(nicheId), [nicheId])
  const searchLabel = useMemo(() => resolveSearchQueries(nicheId, subnicheId).label, [nicheId, subnicheId])

  useEffect(() => {
    const n = getNiche(nicheId)
    if (!n?.subniches?.length) {
      setSubnicheId(null)
      return
    }
    if (!subnicheId || !n.subniches.some((s) => s.id === subnicheId)) {
      setSubnicheId(n.subniches[0].id)
    }
  }, [nicheId, subnicheId])

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase
        .from('brand_search_runs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        const cursor = (data.cursor_json || {}) as { niche?: string; subniche?: string | null }
        if (cursor.niche) setNicheId(cursor.niche)
        if (cursor.subniche !== undefined) setSubnicheId(cursor.subniche)
        setProgress({
          run_id: data.id,
          status: data.status,
          brands_found: data.brands_found,
          target: data.target,
          creators_scanned: data.creators_scanned,
          youtube_scanned: data.youtube_scanned,
          phase: data.phase,
          results: data.results || [],
          error: data.error,
          done: data.status === 'completed' || data.status === 'failed',
          niche: cursor.niche,
          subniche: cursor.subniche,
        })
        setResults((data.results || []) as FoundBrand[])
      }
    })()
  }, [user])

  async function invokeBatch(runId?: string) {
    const { data, error } = await supabase.functions.invoke('find-brands', {
      body: runId
        ? { action: 'continue', run_id: runId, target: TARGET }
        : {
            action: 'start',
            target: TARGET,
            niche: nicheId,
            subniche: subnicheId,
          },
    })
    if (error) throw new Error(error.message)
    if (data?.error && !data?.run_id) throw new Error(data.error)
    return data as RunProgress
  }

  async function runSearch() {
    if (!user || running) return
    if (!nicheId) {
      show('Pick a niche first')
      return
    }
    setRunning(true)
    setResults([])
    setProgress({
      status: 'running',
      brands_found: 0,
      target: TARGET,
      creators_scanned: 0,
      youtube_scanned: 0,
      phase: 'crm',
      niche: nicheId,
      subniche: subnicheId,
      niche_label: searchLabel,
    })
    try {
      let batch = await invokeBatch()
      setProgress(batch)
      setResults(batch.results || [])
      let guard = 0
      while (!batch.done && batch.status === 'running' && guard < 80) {
        guard++
        batch = await invokeBatch(batch.run_id)
        setProgress(batch)
        setResults(batch.results || [])
      }
      if (batch.error && (batch.brands_found || 0) === 0) {
        show(batch.error)
      } else {
        await log(`Brand search (${searchLabel}) found <strong>${batch.brands_found}</strong> brands`)
        show(`Found ${batch.brands_found} brands in ${searchLabel}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      show(msg)
      setProgress((p) => (p ? { ...p, status: 'failed', error: msg, done: true } : p))
    } finally {
      setRunning(false)
    }
  }

  const pct = Math.min(100, Math.round(((progress?.brands_found || 0) / TARGET) * 100))

  return (
    <div>
      {Toast}
      <PageHeader title="Search" subtitle="Discover creators and the brands sponsoring them">
        {tab === 'brands' && (
          <button className="btn btn-primary" type="button" disabled={running || !nicheId} onClick={runSearch}>
            {running ? 'Searching…' : 'Run brand search'}
          </button>
        )}
      </PageHeader>

      <div className="tabs search-tabs" style={{ marginBottom: '1.1rem' }}>
        <button className={`tab ${tab === 'brands' ? 'active' : ''}`} type="button" onClick={() => setTab('brands')}>
          Find Brands
        </button>
        <button className={`tab ${tab === 'creators' ? 'active' : ''}`} type="button" onClick={() => setTab('creators')}>
          Find Creators
        </button>
      </div>

      {tab === 'creators' ? (
        <div className="card search-hero-card">
          <div className="search-coming-soon">
            <div className="search-badge">Soon</div>
            <h2 style={{ marginTop: 0 }}>Find Creators</h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: 520 }}>
              Creator discovery by niche, language, gender, views, and engagement is next. Niche picker below will power
              that flow too.
            </p>
            <button className="btn" type="button" disabled>
              Coming soon
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card search-hero-card" style={{ marginBottom: '1rem' }}>
            <div className="search-kicker">Halal niches</div>
            <h2 style={{ margin: '0.2rem 0 0.35rem' }}>Search conditions</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
              Pick a niche (and subniche when available). Influencers must match that niche <em>and</em> the usual
              gates: 50k+ subs, 50k+ avg views, 1%+ engagement, English, male heuristic.
            </p>

            <div className="niche-grid" role="listbox" aria-label="Niches">
              {SEARCH_NICHES.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="option"
                  aria-selected={nicheId === n.id}
                  className={`niche-pill ${nicheId === n.id ? 'active' : ''}`}
                  disabled={running}
                  onClick={() => setNicheId(n.id)}
                >
                  {n.label}
                </button>
              ))}
            </div>

            {niche?.subniches?.length ? (
              <div style={{ marginTop: '1rem' }}>
                <div className="search-kicker">Subniches in {niche.label}</div>
                <div className="chip-row" style={{ marginTop: '0.55rem' }}>
                  <button
                    type="button"
                    className={`chip chip-btn ${subnicheId === null ? 'active' : ''}`}
                    disabled={running}
                    onClick={() => setSubnicheId(null)}
                  >
                    All {niche.label}
                  </button>
                  {niche.subniches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`chip chip-btn ${subnicheId === s.id ? 'active' : ''}`}
                      disabled={running}
                      onClick={() => setSubnicheId(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="chip-row" style={{ marginBottom: 0 }}>
              <span className="chip">Selected: {searchLabel}</span>
              <span className="chip">CRM first</span>
              <span className="chip">Target 50 brands</span>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="search-hero-grid">
              <div>
                <div className="search-kicker">Pipeline</div>
                <h3 style={{ margin: '0.2rem 0 0.55rem' }}>Find sponsoring brands</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
                  CRM creators in this niche first (once per week each), then YouTube search for matching creators. Scans
                  15–20 recent videos for sponsors.
                </p>
              </div>
              <div className="search-meter">
                <div className="search-meter-label">
                  <span>
                    {progress?.brands_found ?? 0} / {TARGET}
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>{progress?.status || 'idle'}</span>
                </div>
                <div className="search-meter-track">
                  <div className="search-meter-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="search-meter-meta">
                  <span>CRM: {progress?.creators_scanned ?? 0}</span>
                  <span>YouTube: {progress?.youtube_scanned ?? 0}</span>
                  <span>Phase: {progress?.phase || '—'}</span>
                </div>
                {progress?.error && (
                  <p style={{ color: 'var(--danger)', marginBottom: 0, fontSize: '0.9rem' }}>{progress.error}</p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Results</h3>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{results.length} brands</span>
            </div>
            {!results.length ? (
              <Empty>
                <strong>No brands yet</strong>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)' }}>
                  Select a niche (e.g. Tech → Sim Racing Rigs) and run a search.
                </p>
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Domain</th>
                      <th>Source influencer</th>
                      <th>In CRM</th>
                      <th>Video</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={`${r.domain}-${r.source_video_url}`}>
                        <td>
                          <strong>{r.brand_name}</strong>
                          {r.brand_id ? (
                            <>
                              <br />
                              <Link className="link" to={`/app/brands/${r.brand_id}`}>
                                Open brand
                              </Link>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <a className="link" href={`https://${r.domain}`} target="_blank" rel="noreferrer">
                            {r.domain}
                          </a>
                        </td>
                        <td>
                          {r.source_creator_name}
                          {r.source_creator_id ? (
                            <>
                              <br />
                              <Link className="link" to={`/app/creators/${r.source_creator_id}`}>
                                CRM creator
                              </Link>
                            </>
                          ) : (
                            <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>YouTube only</div>
                          )}
                        </td>
                        <td>
                          {r.source_creator_id ? (
                            <span className="badge badge-ok">Linked</span>
                          ) : (
                            <span className="badge">External</span>
                          )}
                        </td>
                        <td>
                          <a className="link" href={r.source_video_url} target="_blank" rel="noreferrer">
                            Watch
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
