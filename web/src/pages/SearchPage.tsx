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

type FoundCreator = {
  creator_id: string | null
  name: string
  channel_id: string
  channel_link: string
  niche: string
  subscribers: number
  avg_views: number
  engagement: number
  last_upload_at: string
  already_in_crm: boolean
}

type BrandProgress = {
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
}

type CreatorProgress = {
  run_id?: string
  status: string
  done?: boolean
  creators_found: number
  target: number
  youtube_scanned: number
  phase?: string
  results?: FoundCreator[]
  error?: string | null
  niche?: string
  subniche?: string | null
  niche_label?: string
  keys_alive?: number
  keys_total?: number
  keys_dead?: number
}

const TARGET = 50

function formatNum(n: number) {
  return Math.round(n).toLocaleString()
}

function formatEr(rate: number) {
  return `${(rate * 100).toFixed(2)}%`
}

export function SearchPage() {
  const { user } = useAuth()
  const log = useActivityLogger()
  const { show, Toast } = useToast()
  const [tab, setTab] = useState<Tab>('creators')
  const [nicheId, setNicheId] = useState('tech')
  const [subnicheId, setSubnicheId] = useState<string | null>('sim-racing-rigs')
  const [running, setRunning] = useState(false)

  const [brandProgress, setBrandProgress] = useState<BrandProgress | null>(null)
  const [brandResults, setBrandResults] = useState<FoundBrand[]>([])
  const [creatorProgress, setCreatorProgress] = useState<CreatorProgress | null>(null)
  const [creatorResults, setCreatorResults] = useState<FoundCreator[]>([])

  const niche = useMemo(() => getNiche(nicheId), [nicheId])
  const searchPack = useMemo(() => resolveSearchQueries(nicheId, subnicheId), [nicheId, subnicheId])
  const searchLabel = searchPack.label

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
      const [{ data: brandRun }, { data: creatorRun }] = await Promise.all([
        supabase
          .from('brand_search_runs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('creator_search_runs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (brandRun) {
        const cursor = (brandRun.cursor_json || {}) as { niche?: string; subniche?: string | null }
        setBrandProgress({
          run_id: brandRun.id,
          status: brandRun.status,
          brands_found: brandRun.brands_found,
          target: brandRun.target,
          creators_scanned: brandRun.creators_scanned,
          youtube_scanned: brandRun.youtube_scanned,
          phase: brandRun.phase,
          results: brandRun.results || [],
          error: brandRun.error,
          done: brandRun.status === 'completed' || brandRun.status === 'failed',
          niche: cursor.niche,
          subniche: cursor.subniche,
        })
        setBrandResults((brandRun.results || []) as FoundBrand[])
      }

      if (creatorRun) {
        const cursor = (creatorRun.cursor_json || {}) as { niche?: string; subniche?: string | null }
        if (cursor.niche) setNicheId(cursor.niche)
        if (cursor.subniche !== undefined) setSubnicheId(cursor.subniche)
        setCreatorProgress({
          run_id: creatorRun.id,
          status: creatorRun.status,
          creators_found: creatorRun.creators_found,
          target: creatorRun.target,
          youtube_scanned: creatorRun.youtube_scanned,
          phase: creatorRun.phase,
          results: creatorRun.results || [],
          error: creatorRun.error,
          done: creatorRun.status === 'completed' || creatorRun.status === 'failed',
          niche: cursor.niche,
          subniche: cursor.subniche,
        })
        setCreatorResults((creatorRun.results || []) as FoundCreator[])
      }
    })()
  }, [user])

  async function invokeBrandBatch(runId?: string) {
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
    return data as BrandProgress
  }

  async function invokeCreatorBatch(runId?: string) {
    const { data, error } = await supabase.functions.invoke('find-creators', {
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
    return data as CreatorProgress
  }

  async function runBrandSearch() {
    if (!user || running) return
    if (!nicheId) {
      show('Pick a niche first')
      return
    }
    setRunning(true)
    setBrandResults([])
    setBrandProgress({
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
      let batch = await invokeBrandBatch()
      setBrandProgress(batch)
      setBrandResults(batch.results || [])
      let guard = 0
      while (!batch.done && batch.status === 'running' && guard < 80) {
        guard++
        batch = await invokeBrandBatch(batch.run_id)
        setBrandProgress(batch)
        setBrandResults(batch.results || [])
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
      setBrandProgress((p) => (p ? { ...p, status: 'failed', error: msg, done: true } : p))
    } finally {
      setRunning(false)
    }
  }

  async function runCreatorSearch() {
    if (!user || running) return
    if (!nicheId) {
      show('Pick a niche first')
      return
    }
    setRunning(true)
    setCreatorResults([])
    setCreatorProgress({
      status: 'running',
      creators_found: 0,
      target: TARGET,
      youtube_scanned: 0,
      phase: 'youtube',
      niche: nicheId,
      subniche: subnicheId,
      niche_label: searchLabel,
    })
    try {
      let batch = await invokeCreatorBatch()
      setCreatorProgress(batch)
      setCreatorResults(batch.results || [])
      let guard = 0
      while (!batch.done && batch.status === 'running' && guard < 250) {
        guard++
        batch = await invokeCreatorBatch(batch.run_id)
        setCreatorProgress(batch)
        setCreatorResults(batch.results || [])
      }
      if (!batch.done && batch.status === 'running') {
        show(`Still running after many batches — ${batch.creators_found || 0}/50 so far. Run again to continue.`)
      } else if (batch.error && (batch.creators_found || 0) === 0) {
        show(batch.error)
      } else if ((batch.creators_found || 0) < TARGET && batch.error) {
        show(batch.error)
      } else {
        await log(`Creator search (${searchLabel}) found <strong>${batch.creators_found}</strong> influencers`)
        show(`Found ${batch.creators_found} influencers in ${searchLabel}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      show(msg)
      setCreatorProgress((p) => (p ? { ...p, status: 'failed', error: msg, done: true } : p))
    } finally {
      setRunning(false)
    }
  }

  const brandPct = Math.min(100, Math.round(((brandProgress?.brands_found || 0) / TARGET) * 100))
  const creatorPct = Math.min(100, Math.round(((creatorProgress?.creators_found || 0) / TARGET) * 100))

  return (
    <div>
      {Toast}
      <PageHeader title="Search" subtitle="Discover creators and the brands sponsoring them">
        {tab === 'brands' ? (
          <button className="btn btn-primary" type="button" disabled={running || !nicheId} onClick={runBrandSearch}>
            {running ? 'Searching…' : 'Run brand search'}
          </button>
        ) : (
          <button className="btn btn-primary" type="button" disabled={running || !nicheId} onClick={runCreatorSearch}>
            {running ? 'Searching…' : 'Run creator search'}
          </button>
        )}
      </PageHeader>

      <div className="tabs search-tabs" style={{ marginBottom: '1.1rem' }}>
        <button className={`tab ${tab === 'creators' ? 'active' : ''}`} type="button" onClick={() => setTab('creators')}>
          Find Creators
        </button>
        <button className={`tab ${tab === 'brands' ? 'active' : ''}`} type="button" onClick={() => setTab('brands')}>
          Find Brands
        </button>
      </div>

      <div className="card search-hero-card" style={{ marginBottom: '1rem' }}>
        <div className="search-kicker">Halal niches</div>
        <h2 style={{ margin: '0.2rem 0 0.35rem' }}>Search conditions</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Pick a niche (and subniche when available). Influencers must match that niche <em>and</em> the gates: male,
          50k+ subs, 50k+ avg views, 1%+ engagement, English, posted in the last month.
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

        <div className="chip-row" style={{ marginBottom: 0, marginTop: '0.85rem' }}>
          <span className="chip">Selected: {searchLabel}</span>
          <span className="chip">Target 50</span>
          <span className="chip">Male · 1%+ ER · 50k+ subs/views</span>
          <span className="chip">Posted last 30 days</span>
        </div>
      </div>

      {tab === 'creators' ? (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="search-hero-grid">
              <div>
                <div className="search-kicker">Pipeline</div>
                <h3 style={{ margin: '0.2rem 0 0.55rem' }}>Find influencers</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
                  Multi-strategy YouTube discovery for your niche. Skips Creators + Deleted, and skips any channel
                  already checked in the last 3 weeks so each run digs into new people. After 3 weeks, checked
                  channels can be searched again. Keeps going until 50 (or quota / full drain).
                </p>
              </div>
              <div className="search-meter">
                <div className="search-meter-label">
                  <span>
                    {creatorProgress?.creators_found ?? 0} / {TARGET}
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>{creatorProgress?.status || 'idle'}</span>
                </div>
                <div className="search-meter-track">
                  <div className="search-meter-fill" style={{ width: `${creatorPct}%` }} />
                </div>
                <div className="search-meter-meta">
                  <span>YouTube scanned: {creatorProgress?.youtube_scanned ?? 0}</span>
                  <span>Phase: {creatorProgress?.phase || '—'}</span>
                  {creatorProgress?.keys_total != null ? (
                    <span>
                      Keys: {creatorProgress.keys_alive ?? '—'} / {creatorProgress.keys_total} alive
                    </span>
                  ) : null}
                </div>
                {creatorProgress?.error && (
                  <p style={{ color: 'var(--danger)', marginBottom: 0, fontSize: '0.9rem' }}>{creatorProgress.error}</p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Results</h3>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{creatorResults.length} influencers</span>
            </div>
            {!creatorResults.length ? (
              <Empty>
                <strong>No influencers yet</strong>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)' }}>
                  Select a niche (e.g. Tech → Sim Racing Rigs) and run a creator search.
                </p>
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Creator</th>
                      <th>Subs</th>
                      <th>Avg views</th>
                      <th>ER</th>
                      <th>Last upload</th>
                      <th>CRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creatorResults.map((r) => (
                      <tr key={r.channel_id}>
                        <td>
                          <strong>{r.name}</strong>
                          <br />
                          <a className="link" href={r.channel_link} target="_blank" rel="noreferrer">
                            YouTube
                          </a>
                          {r.creator_id ? (
                            <>
                              {' · '}
                              <Link className="link" to={`/app/creators/${r.creator_id}`}>
                                Open
                              </Link>
                            </>
                          ) : null}
                        </td>
                        <td>{formatNum(r.subscribers)}</td>
                        <td>{formatNum(r.avg_views)}</td>
                        <td>{formatEr(r.engagement)}</td>
                        <td>{r.last_upload_at ? r.last_upload_at.slice(0, 10) : '—'}</td>
                        <td>
                          {r.already_in_crm ? (
                            <span className="badge">Existing</span>
                          ) : (
                            <span className="badge badge-ok">Added</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="search-hero-grid">
              <div>
                <div className="search-kicker">Pipeline</div>
                <h3 style={{ margin: '0.2rem 0 0.55rem' }}>Find sponsoring brands</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
                  CRM creators in this niche first (once per week each), then YouTube search for matching creators. Scans
                  recent videos for sponsors.
                </p>
              </div>
              <div className="search-meter">
                <div className="search-meter-label">
                  <span>
                    {brandProgress?.brands_found ?? 0} / {TARGET}
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>{brandProgress?.status || 'idle'}</span>
                </div>
                <div className="search-meter-track">
                  <div className="search-meter-fill" style={{ width: `${brandPct}%` }} />
                </div>
                <div className="search-meter-meta">
                  <span>CRM: {brandProgress?.creators_scanned ?? 0}</span>
                  <span>YouTube: {brandProgress?.youtube_scanned ?? 0}</span>
                  <span>Phase: {brandProgress?.phase || '—'}</span>
                </div>
                {brandProgress?.error && (
                  <p style={{ color: 'var(--danger)', marginBottom: 0, fontSize: '0.9rem' }}>{brandProgress.error}</p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Results</h3>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{brandResults.length} brands</span>
            </div>
            {!brandResults.length ? (
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
                    {brandResults.map((r) => (
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
