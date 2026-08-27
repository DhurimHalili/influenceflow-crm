-- ===========================================================================
-- 20260827200756: Hardware-accurate remediation (re-applies 00800 fix)
-- 00800 was already marked applied on remote before content finalized,
-- so this delta re-applies the same gates for real.
-- User feedback: was getting pure gamers (no desk), only Shorts, and Indian
-- ===========================================================================

-- 1) Raise accuracy gates for future inserts (change column defaults)
alter table public.creator_discovery_settings
  alter column niche set default 'Desk Setups · Hardware Tests',
  alter column min_longform_videos set default 5,
  alter column shorts_max_seconds set default 70;

-- 2) Update keyword / exclusion / bio defaults to hardware-focused,
--    India-excluded, gameplay-trap-filtered pools
alter table public.creator_discovery_settings
  alter column keywords set default array[
    'desk setup tour','battlestation tour','gaming setup tour','minimal desk setup','rgb desk setup',
    'cable management setup','dual monitor desk setup','triple monitor battlestation','ultrawide desk setup','standing desk gaming setup',
    'white gaming setup','aesthetic desk setup','cozy gaming setup','gaming corner setup','streamer desk setup',
    'pc build showcase','custom pc build','gaming pc build 2024','motherboard review','motherboard unboxing','gpu review','graphics card test',
    'nvidia rtx setup','amd gpu build','intel vs amd build','ram upgrade gaming setup','ssd nvme pc build',
    'pc case setup','water cooling pc build','hardware review desk','benchmark gaming setup','pc components setup tour',
    'content creator desk setup','productivity desk setup','home office gaming setup','modded pc battlestation'
  ],
  alter column negative_kw set default array[
    'kitchen setup','school desk','stock trading setup','forex setup','call center setup','dentist office setup','photography studio setup',
    'wedding setup','camping setup','tattoo studio setup','makeup vanity setup','aquarium setup','home theater setup','network server setup',
    'vpn setup tutorial','printer setup','router setup','accounting desk','law office setup','realtor desk','baby nursery setup','toy room setup',
    'classroom desk setup','church sound setup','DJ booth setup','garage workshop setup','sewing room setup','art studio setup',
    'gameplay','let''s play','lets play','walkthrough','speedrun','no commentary','funny moments','montage',
    'hindi','tamil','telugu','malayalam','bengali','punjabi','bgmi','free fire india','desi gaming'
  ],
  alter column niche_bio_kw set default array[
    'desk setup','battlestation','setup tour','gaming setup','workspace','cable management',
    'pc build','motherboard','gpu','graphics card','nvidia','amd','intel','cpu','ram',
    'hardware','peripherals','monitor','ultrawide','mechanical keyboard','rgb'
  ];

-- 3) Optionally upgrade EXISTING rows that are still on the old factory defaults
--    (only touches rows that never changed; preserves any custom user edits)
--    Safe to run repeatedly — matches exact old default arrays

-- Upgrade old 30-keyword pool → new hardware pool (only if still exactly old)
update public.creator_discovery_settings
set keywords = array[
    'desk setup tour','battlestation tour','gaming setup tour','minimal desk setup','rgb desk setup',
    'cable management setup','dual monitor desk setup','triple monitor battlestation','ultrawide desk setup','standing desk gaming setup',
    'white gaming setup','aesthetic desk setup','cozy gaming setup','gaming corner setup','streamer desk setup',
    'pc build showcase','custom pc build','gaming pc build 2024','motherboard review','motherboard unboxing','gpu review','graphics card test',
    'nvidia rtx setup','amd gpu build','intel vs amd build','ram upgrade gaming setup','ssd nvme pc build',
    'pc case setup','water cooling pc build','hardware review desk','benchmark gaming setup','pc components setup tour',
    'content creator desk setup','productivity desk setup','home office gaming setup','modded pc battlestation'
  ],
    niche = 'Desk Setups · Hardware Tests',
    updated_at = now()
where keywords = array[
    'gaming setup','battlestation','desk setup','triple monitor setup','cable management','dual monitor setup','white gaming setup','rgb setup',
    'mechanical keyboard setup','gaming room setup','streamer setup','pc build showcase','study desk setup','productivity desk setup',
    'minimalist gaming setup','gaming chair setup','cozy gaming setup','pink gaming setup','desk tour','gaming corner','custom pc setup',
    'ultrawide monitor setup','standing desk gaming','modded pc build','home office gaming setup','gaming desk','room tour desk','monitor arm setup',
    'led strip desk setup','aesthetic desk setup'
  ];

-- Upgrade old niche_bio_kw (17 items) → new 21-item hardware bio list
update public.creator_discovery_settings
set niche_bio_kw = array[
    'desk setup','battlestation','setup tour','gaming setup','workspace','cable management',
    'pc build','motherboard','gpu','graphics card','nvidia','amd','intel','cpu','ram',
    'hardware','peripherals','monitor','ultrawide','mechanical keyboard','rgb'
  ],
    updated_at = now()
where niche_bio_kw = array[
    'gaming setup','battlestation','desk setup','pc setup','setup tour','rig','workspace','streamer','desk','cable management','keyboard','monitor',
    'gaming room','gaming pc','rgb','setup','peripherals'
  ];

-- Append Indian / gameplay traps to existing negative_kw where missing (idempotent)
-- Only expands rows that still have the original small negative list (18 items)
update public.creator_discovery_settings
set negative_kw = array[
    'kitchen setup','school desk','stock trading setup','forex setup','call center setup','dentist office setup','photography studio setup',
    'wedding setup','camping setup','tattoo studio setup','makeup vanity setup','aquarium setup','home theater setup','network server setup',
    'vpn setup tutorial','printer setup','router setup','accounting desk','law office setup','realtor desk','baby nursery setup','toy room setup',
    'classroom desk setup','church sound setup','DJ booth setup','garage workshop setup','sewing room setup','art studio setup',
    'gameplay','let''s play','lets play','walkthrough','speedrun','no commentary','funny moments','montage',
    'hindi','tamil','telugu','malayalam','bengali','punjabi','bgmi','free fire india','desi gaming'
  ],
    updated_at = now()
where negative_kw = array[
    'kitchen setup','school desk','stock trading setup','forex setup','call center setup','dentist office setup','photography studio setup',
    'wedding setup','camping setup','tattoo studio setup','makeup vanity setup','aquarium setup','home theater setup','network server setup',
    'accounting desk','law office setup','baby nursery setup','classroom desk setup'
  ];

-- Bump min_longform_videos 3→5 and shorts_max 60→70 for active rows (user can still edit later)
update public.creator_discovery_settings
set min_longform_videos = 5, shorts_max_seconds = 70, updated_at = now()
where min_longform_videos = 3 and shorts_max_seconds = 60;

-- Backfill any users who somehow have no settings row
insert into public.creator_discovery_settings (user_id)
  select id from auth.users
  on conflict (user_id) do nothing;

