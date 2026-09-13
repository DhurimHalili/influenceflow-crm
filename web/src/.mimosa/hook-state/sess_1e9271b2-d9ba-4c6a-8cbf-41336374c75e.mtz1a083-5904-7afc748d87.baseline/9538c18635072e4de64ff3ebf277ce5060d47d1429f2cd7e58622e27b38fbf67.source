import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Brand, Creator } from '../lib/types'
import { excludeBrands, excludeCreators } from '../lib/exclusions'
import { Empty, useToast } from '../components/ui'
import { PageHeader, useActivityLogger } from '../components/Layout'

type Tab = 'creators' | 'brands'

export function DeletedPage() {
  const { user } = useAuth()
  const log = useActivityLogger()
  const { show, Toast } = useToast()
  const [tab, setTab] = useState<Tab>('creators')
  const [creators, setCreators] = useState<Creator[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedCreators, setSelectedCreators] = useState<Set<string>>(new Set())
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set())

  async function load() {
    if (!user) return
    const [c, b] = await Promise.all([
      supabase
        .from('creators')
        .select('*')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false }),
      supabase
        .from('brands')
        .select('*')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false }),
    ])
    setCreators((c.data || []) as Creator[])
    setBrands((b.data || []) as Brand[])
  }

  useEffect(() => {
    load()
  }, [user])

  const filteredCreators = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return creators
    return creators.filter((c) =>
      [c.name, c.contact_email, c.channel_link, c.niche].some((v) => (v || '').toLowerCase().includes(s)),
    )
  }, [creators, q])

  const filteredBrands = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return brands
    return brands.filter((b) =>
      [b.name, b.domain, b.contact_email].some((v) => (v || '').toLowerCase().includes(s)),
    )
  }, [brands, q])

  async function restoreCreators(ids: string[]) {
    if (!user || !ids.length) return
    setBusy(true)
    const { error } = await supabase
      .from('creators')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .in('id', ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Restored ${ids.length} creator${ids.length === 1 ? '' : 's'} from Deleted`)
    setSelectedCreators(new Set())
    show(`Restored ${ids.length}`)
    load()
  }

  async function restoreBrands(ids: string[]) {
    if (!user || !ids.length) return
    setBusy(true)
    const { error } = await supabase
      .from('brands')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .in('id', ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Restored ${ids.length} brand${ids.length === 1 ? '' : 's'} from Deleted`)
    setSelectedBrands(new Set())
    show(`Restored ${ids.length}`)
    load()
  }

  async function purgeCreators(ids: string[]) {
    if (!user || !ids.length) return
    if (
      !confirm(
        `Permanently delete ${ids.length} creator${ids.length === 1 ? '' : 's'}? Search will never suggest them again.`,
      )
    ) {
      return
    }
    setBusy(true)
    const rows = creators.filter((c) => ids.includes(c.id))
    await excludeCreators(
      user.id,
      rows.map((c) => ({ name: c.name, channel_link: c.channel_link })),
    )
    const { error: joinErr } = await supabase.from('campaign_creators').delete().in('creator_id', ids)
    if (joinErr) {
      setBusy(false)
      show(joinErr.message)
      return
    }
    const { error } = await supabase.from('creators').delete().in('id', ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Permanently deleted ${ids.length} creators (blocked from Search)`)
    setSelectedCreators(new Set())
    show(`Permanently deleted ${ids.length}`)
    load()
  }

  async function purgeBrands(ids: string[]) {
    if (!user || !ids.length) return
    if (
      !confirm(
        `Permanently delete ${ids.length} brand${ids.length === 1 ? '' : 's'}? Search will never suggest them again.`,
      )
    ) {
      return
    }
    setBusy(true)
    const rows = brands.filter((b) => ids.includes(b.id))
    await excludeBrands(
      user.id,
      rows.map((b) => ({ name: b.name, domain: b.domain })),
    )
    const { data: campaigns } = await supabase.from('campaigns').select('id').in('brand_id', ids)
    const campaignIds = (campaigns || []).map((c) => c.id)
    if (campaignIds.length) {
      await supabase.from('campaign_creators').delete().in('campaign_id', campaignIds)
      await supabase.from('campaigns').delete().in('id', campaignIds)
    }
    await supabase.from('brand_contacts').delete().in('brand_id', ids)
    await supabase.from('external_links').delete().in('brand_id', ids)
    const { error } = await supabase.from('brands').delete().in('id', ids)
    setBusy(false)
    if (error) {
      show(error.message)
      return
    }
    await log(`Permanently deleted ${ids.length} brands (blocked from Search)`)
    setSelectedBrands(new Set())
    show(`Permanently deleted ${ids.length}`)
    load()
  }

  return (
    <div>
      {Toast}
      <PageHeader
        title="Deleted"
        subtitle="Soft-deleted creators and brands. Restore them, or permanently delete to block Search forever."
      />

      <div className="tabs search-tabs" style={{ marginBottom: '1.1rem' }}>
        <button className={`tab ${tab === 'creators' ? 'active' : ''}`} type="button" onClick={() => setTab('creators')}>
          Creators ({creators.length})
        </button>
        <button className={`tab ${tab === 'brands' ? 'active' : ''}`} type="button" onClick={() => setTab('brands')}>
          Brands ({brands.length})
        </button>
      </div>

      <div className="filters">
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Filter deleted…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Link className="btn" to={tab === 'creators' ? '/app/creators' : '/app/brands'}>
          Back to {tab === 'creators' ? 'Creators' : 'Brands'}
        </Link>
      </div>

      {tab === 'creators' ? (
        <>
          {selectedCreators.size > 0 && (
            <div className="bulk-bar">
              <span className="bulk-bar-count">{selectedCreators.size} selected</span>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => restoreCreators([...selectedCreators])}>
                Restore
              </button>
              <button className="btn btn-danger" type="button" disabled={busy} onClick={() => purgeCreators([...selectedCreators])}>
                Delete forever
              </button>
              <button className="btn" type="button" onClick={() => setSelectedCreators(new Set())}>
                Clear
              </button>
            </div>
          )}
          <div className="card">
            {!filteredCreators.length ? (
              <Empty>
                <strong>No deleted creators</strong>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)' }}>
                  When you delete a creator from Creators, they land here. Search skips everyone on this list.
                </p>
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input
                          type="checkbox"
                          checked={filteredCreators.length > 0 && filteredCreators.every((c) => selectedCreators.has(c.id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedCreators(new Set(filteredCreators.map((c) => c.id)))
                            else setSelectedCreators(new Set())
                          }}
                        />
                      </th>
                      <th>Name</th>
                      <th>Channel</th>
                      <th>Niche</th>
                      <th>Deleted</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCreators.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedCreators.has(c.id)}
                            onChange={() => {
                              setSelectedCreators((prev) => {
                                const next = new Set(prev)
                                if (next.has(c.id)) next.delete(c.id)
                                else next.add(c.id)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td>
                          {c.channel_link ? (
                            <a className="link" href={c.channel_link} target="_blank" rel="noreferrer">
                              YouTube
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{c.niche || '—'}</td>
                        <td>{c.archived_at ? c.archived_at.slice(0, 10) : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => restoreCreators([c.id])}>
                            Restore
                          </button>
                          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => purgeCreators([c.id])}>
                            Forever
                          </button>
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
          {selectedBrands.size > 0 && (
            <div className="bulk-bar">
              <span className="bulk-bar-count">{selectedBrands.size} selected</span>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => restoreBrands([...selectedBrands])}>
                Restore
              </button>
              <button className="btn btn-danger" type="button" disabled={busy} onClick={() => purgeBrands([...selectedBrands])}>
                Delete forever
              </button>
              <button className="btn" type="button" onClick={() => setSelectedBrands(new Set())}>
                Clear
              </button>
            </div>
          )}
          <div className="card">
            {!filteredBrands.length ? (
              <Empty>
                <strong>No deleted brands</strong>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)' }}>
                  When you delete a brand from Brands, they land here. Search skips everyone on this list.
                </p>
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input
                          type="checkbox"
                          checked={filteredBrands.length > 0 && filteredBrands.every((b) => selectedBrands.has(b.id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedBrands(new Set(filteredBrands.map((b) => b.id)))
                            else setSelectedBrands(new Set())
                          }}
                        />
                      </th>
                      <th>Brand</th>
                      <th>Domain</th>
                      <th>Deleted</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBrands.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBrands.has(b.id)}
                            onChange={() => {
                              setSelectedBrands((prev) => {
                                const next = new Set(prev)
                                if (next.has(b.id)) next.delete(b.id)
                                else next.add(b.id)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td>
                          <strong>{b.name}</strong>
                        </td>
                        <td>
                          {b.domain ? (
                            <a className="link" href={`https://${b.domain}`} target="_blank" rel="noreferrer">
                              {b.domain}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{b.archived_at ? b.archived_at.slice(0, 10) : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => restoreBrands([b.id])}>
                            Restore
                          </button>
                          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => purgeBrands([b.id])}>
                            Forever
                          </button>
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
