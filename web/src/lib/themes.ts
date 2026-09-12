import type { Theme } from './types'

export interface ThemeMeta {
  id: Theme
  name: string
  tagline: string
  // preview swatches: [background, surface, accent]
  swatches: [string, string, string]
  dot: string
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Warm paper, espresso ink, terracotta accent. The default — calm and professional.',
    swatches: ['#EFE9DC', '#FBF9F4', '#B65C2E'],
    dot: '#B65C2E',
  },
  {
    id: 'light',
    name: 'Light',
    tagline: 'Clean soft white with warm gray text. Bright without glare.',
    swatches: ['#F7F6F3', '#FFFFFF', '#2F6FED'],
    dot: '#2F6FED',
  },
  {
    id: 'dark',
    name: 'Dark',
    tagline: 'Warm charcoal for late-night work. Muted, never neon.',
    swatches: ['#171310', '#221D17', '#D08A4E'],
    dot: '#D08A4E',
  },
  {
    id: 'honey',
    name: 'Honey',
    tagline: 'Golden ambers and cream. Cozy, rich, easy on the eyes.',
    swatches: ['#F5E7C8', '#FFF8E8', '#B07C1F'],
    dot: '#B07C1F',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    tagline: 'Muted slate blues and sea glass. Calm and focused.',
    swatches: ['#E7EEF0', '#F7FAFB', '#2E7D8A'],
    dot: '#2E7D8A',
  },
]

export const DEFAULT_THEME: Theme = 'agency'

export function isTheme(v: unknown): v is Theme {
  return THEMES.some((t) => t.id === v)
}

export function themeName(id: string | null | undefined): string {
  return THEMES.find((t) => t.id === id)?.name ?? 'Agency'
}
