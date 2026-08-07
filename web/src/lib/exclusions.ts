import { supabase } from './supabase'

/** Extract YouTube channel id (UC…) from a URL or raw id when possible. */
export function extractChannelId(link: string | null | undefined): string | null {
  if (!link) return null
  const m = link.match(/UC[\w-]{20,}/)
  if (m) return m[0]
  return null
}

export function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    let s = raw.trim().toLowerCase()
    if (!s.startsWith('http')) s = 'https://' + s
    return new URL(s).hostname.replace(/^www\./, '')
  } catch {
    return raw.trim().toLowerCase().replace(/^www\./, '')
  }
}

export async function excludeCreators(
  userId: string,
  rows: { name: string; channel_link?: string | null }[],
) {
  const payload: {
    user_id: string
    kind: 'creator'
    exclusion_key: string
    label: string
    channel_link: string | null
  }[] = []
  for (const r of rows) {
    const channelId = extractChannelId(r.channel_link)
    const key = channelId || (r.channel_link || '').trim().toLowerCase() || r.name.trim().toLowerCase()
    if (!key) continue
    payload.push({
      user_id: userId,
      kind: 'creator',
      exclusion_key: key,
      label: r.name,
      channel_link: r.channel_link || null,
    })
  }
  if (!payload.length) return
  await supabase.from('search_exclusions').upsert(payload, { onConflict: 'user_id,kind,exclusion_key' })
}

export async function excludeBrands(
  userId: string,
  rows: { name: string; domain?: string | null }[],
) {
  const payload: {
    user_id: string
    kind: 'brand'
    exclusion_key: string
    label: string
    domain: string | null
  }[] = []
  for (const r of rows) {
    const domain = normalizeDomain(r.domain)
    const key = domain || r.name.trim().toLowerCase()
    if (!key) continue
    payload.push({
      user_id: userId,
      kind: 'brand',
      exclusion_key: key,
      label: r.name,
      domain: domain || null,
    })
  }
  if (!payload.length) return
  await supabase.from('search_exclusions').upsert(payload, { onConflict: 'user_id,kind,exclusion_key' })
}

export async function clearCreatorExclusions(userId: string, rows: { name: string; channel_link?: string | null }[]) {
  for (const r of rows) {
    const channelId = extractChannelId(r.channel_link)
    const keys = [channelId, (r.channel_link || '').trim().toLowerCase(), r.name.trim().toLowerCase()].filter(Boolean) as string[]
    if (!keys.length) continue
    await supabase.from('search_exclusions').delete().eq('user_id', userId).eq('kind', 'creator').in('exclusion_key', keys)
  }
}

export async function clearBrandExclusions(userId: string, rows: { name: string; domain?: string | null }[]) {
  for (const r of rows) {
    const domain = normalizeDomain(r.domain)
    const keys = [domain, r.name.trim().toLowerCase()].filter(Boolean) as string[]
    if (!keys.length) continue
    await supabase.from('search_exclusions').delete().eq('user_id', userId).eq('kind', 'brand').in('exclusion_key', keys)
  }
}
