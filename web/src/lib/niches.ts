/** Halal niches for Search → Find Brands / Find Creators */

export type NicheDef = {
  id: string
  label: string
  /** YouTube search queries for this niche (or parent if no subniche) */
  keywords: string[]
  /** Terms used to score CRM creator niche / channel about text */
  match: string[]
  subniches?: { id: string; label: string; keywords: string[]; match: string[] }[]
}

export const SEARCH_NICHES: NicheDef[] = [
  {
    id: 'automotive',
    label: 'Automotive',
    keywords: ['car review', 'automotive review', 'car detailing', 'EV car review', 'modded car'],
    match: ['car', 'auto', 'vehicle', 'automotive', 'ev', 'truck'],
  },
  {
    id: 'productivity',
    label: 'Productivity',
    keywords: ['productivity apps review', 'notion setup', 'second brain apps', 'time management tools'],
    match: ['productivity', 'notion', 'habits', 'workflow', 'gtd'],
  },
  {
    id: 'podcasts',
    label: 'Podcasts',
    keywords: ['podcast gear review', 'podcast microphone setup', 'best podcast equipment'],
    match: ['podcast', 'microphone', 'recording studio'],
  },
  {
    id: 'education',
    label: 'Education',
    keywords: ['online learning tools', 'study apps review', 'education technology review'],
    match: ['education', 'learn', 'study', 'course', 'tutor'],
  },
  {
    id: 'pets',
    label: 'Pets',
    keywords: ['dog products review', 'pet products review', 'cat products review'],
    match: ['pet', 'dog', 'cat', 'puppy', 'kitten'],
  },
  {
    id: 'baby-kids',
    label: 'Baby & Kids Products',
    keywords: ['baby products review', 'kids toys review', 'stroller review'],
    match: ['baby', 'kids', 'toddler', 'stroller', 'nursery'],
  },
  {
    id: 'ai',
    label: 'AI',
    keywords: [
      'best AI tools 2025',
      'ChatGPT tools review',
      'AI agent tools',
      'AI software review',
      'artificial intelligence tools',
    ],
    match: ['ai', 'chatgpt', 'openai', 'llm', 'machine learning', 'artificial intelligence'],
  },
  {
    id: 'tech',
    label: 'Tech',
    keywords: ['tech gadgets review', 'consumer tech review', 'new tech unboxing', 'tech product review'],
    match: ['tech', 'gadget', 'electronics', 'hardware', 'device'],
    subniches: [
      {
        id: 'desk-setups',
        label: 'Desk Setups',
        keywords: [
          'desk setup tour',
          'battlestation setup',
          'ultrawide desk setup',
          'office desk setup review',
          'monitor desk setup',
          'desk accessories review',
        ],
        match: ['desk setup', 'battlestation', 'desk tour', 'workspace setup', 'monitor setup', 'desk mat'],
      },
    ],
  },
  {
    id: 'diy',
    label: 'DIY Products',
    keywords: ['DIY tools review', 'home DIY products', 'maker tools review'],
    match: ['diy', 'maker', 'craft', 'build', 'handmade'],
  },
  {
    id: 'content',
    label: 'Content',
    keywords: ['content creator gear', 'camera for youtube', 'creator tools review'],
    match: ['content creator', 'youtube gear', 'filmmaking', 'vlogging'],
  },
  {
    id: 'physical-products',
    label: 'Physical Products',
    keywords: ['product review unboxing', 'amazon finds review', 'physical product review'],
    match: ['unboxing', 'product review', 'amazon finds'],
  },
  {
    id: 'books',
    label: 'Books',
    keywords: ['book recommendations', 'best books review', 'nonfiction book review'],
    match: ['book', 'reading', 'author', 'literature'],
  },
  {
    id: 'self-development',
    label: 'Self-Development',
    keywords: ['self improvement tips', 'personal development books', 'motivation habits'],
    match: ['self improvement', 'mindset', 'habits', 'motivation', 'personal development'],
  },
  {
    id: 'travel',
    label: 'Travel',
    keywords: ['travel gear review', 'best travel accessories', 'travel packing products'],
    match: ['travel', 'trip', 'luggage', 'backpack', 'vacation'],
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    keywords: ['lifestyle products review', 'daily lifestyle haul'],
    match: ['lifestyle', 'day in my life', 'vlog'],
  },
  {
    id: 'teaching',
    label: 'Teaching',
    keywords: ['teacher classroom products', 'teaching tools review'],
    match: ['teacher', 'teaching', 'classroom', 'lesson'],
  },
  {
    id: 'home-decor',
    label: 'Home Decor',
    keywords: ['home decor haul', 'interior design products', 'home styling review'],
    match: ['home decor', 'interior', 'furniture', 'styling'],
  },
  {
    id: 'home-garden',
    label: 'Home & Garden',
    keywords: ['garden tools review', 'home improvement products', 'lawn garden review'],
    match: ['garden', 'lawn', 'home improvement', 'outdoor'],
  },
  {
    id: 'wedding-events',
    label: 'Wedding & Events',
    keywords: ['wedding products review', 'event planning products', 'wedding favors review'],
    match: ['wedding', 'event planning', 'bridal', 'party'],
  },
]

export function getNiche(id: string) {
  return SEARCH_NICHES.find((n) => n.id === id)
}

export function getSubniche(nicheId: string, subId: string) {
  return getNiche(nicheId)?.subniches?.find((s) => s.id === subId)
}

export function resolveSearchQueries(nicheId: string, subnicheId?: string | null) {
  const niche = getNiche(nicheId)
  if (!niche) return { keywords: [] as string[], match: [] as string[], label: nicheId }
  if (subnicheId) {
    const sub = niche.subniches?.find((s) => s.id === subnicheId)
    if (sub) {
      return {
        keywords: sub.keywords,
        match: sub.match,
        label: `${niche.label} · ${sub.label}`,
      }
    }
  }
  return { keywords: niche.keywords, match: niche.match, label: niche.label }
}
