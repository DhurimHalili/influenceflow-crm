-- Broad gear: user wants desks + ALL gaming-PC gear (chairs, keyboards, mice, monitors, headsets) — not only motherboard/GPU
-- Expands keywords and bio to 44 items, relaxes gate from 1desk+1hw to 2x any gear/setup

alter table public.creator_discovery_settings
  alter column niche set default 'Desk Setups · Gaming PC Gear',
  alter column keywords set default array[
    'desk setup tour','battlestation tour','gaming setup tour','minimal desk setup','rgb desk setup',
    'cable management setup','dual monitor desk setup','triple monitor battlestation','ultrawide desk setup','standing desk gaming setup',
    'white gaming setup','aesthetic desk setup','cozy gaming setup','gaming corner setup','streamer desk setup',
    'gaming chair review','ergonomic chair setup','mechanical keyboard review','gaming keyboard setup','keycaps setup',
    'gaming mouse review','desk mat setup','monitor review gaming setup','ultrawide monitor setup','headset review setup',
    'microphone setup tour','rgb lighting setup','peripherals setup tour','gaming accessories setup',
    'pc build showcase','custom pc build','gaming pc build 2024','motherboard review','gpu review','graphics card test',
    'nvidia rtx setup','amd gpu build','intel vs amd build','ram upgrade gaming setup','ssd nvme pc build',
    'pc case setup','water cooling pc build','hardware review desk','benchmark gaming setup','pc components setup tour',
    'content creator desk setup','productivity desk setup','home office gaming setup','modded pc battlestation'
  ],
  alter column niche_bio_kw set default array[
    'desk setup','battlestation','setup tour','gaming setup','workspace','cable management',
    'pc build','motherboard','gpu','graphics card','nvidia','amd','intel','cpu','ram',
    'hardware','peripherals','monitor','ultrawide','mechanical keyboard','gaming chair','gaming mouse','headset','rgb'
  ];

-- Upgrade rows that are still on the prior narrow hardware list (36 items) → broad 44
update public.creator_discovery_settings
set keywords = array[
    'desk setup tour','battlestation tour','gaming setup tour','minimal desk setup','rgb desk setup',
    'cable management setup','dual monitor desk setup','triple monitor battlestation','ultrawide desk setup','standing desk gaming setup',
    'white gaming setup','aesthetic desk setup','cozy gaming setup','gaming corner setup','streamer desk setup',
    'gaming chair review','ergonomic chair setup','mechanical keyboard review','gaming keyboard setup','keycaps setup',
    'gaming mouse review','desk mat setup','monitor review gaming setup','ultrawide monitor setup','headset review setup',
    'microphone setup tour','rgb lighting setup','peripherals setup tour','gaming accessories setup',
    'pc build showcase','custom pc build','gaming pc build 2024','motherboard review','gpu review','graphics card test',
    'nvidia rtx setup','amd gpu build','intel vs amd build','ram upgrade gaming setup','ssd nvme pc build',
    'pc case setup','water cooling pc build','hardware review desk','benchmark gaming setup','pc components setup tour',
    'content creator desk setup','productivity desk setup','home office gaming setup','modded pc battlestation'
  ],
    niche_bio_kw = array[
    'desk setup','battlestation','setup tour','gaming setup','workspace','cable management',
    'pc build','motherboard','gpu','graphics card','nvidia','amd','intel','cpu','ram',
    'hardware','peripherals','monitor','ultrawide','mechanical keyboard','gaming chair','gaming mouse','headset','rgb'
  ],
    niche = 'Desk Setups · Gaming PC Gear',
    updated_at = now()
where keywords = array[
    'desk setup tour','battlestation tour','gaming setup tour','minimal desk setup','rgb desk setup',
    'cable management setup','dual monitor desk setup','triple monitor battlestation','ultrawide desk setup','standing desk gaming setup',
    'white gaming setup','aesthetic desk setup','cozy gaming setup','gaming corner setup','streamer desk setup',
    'pc build showcase','custom pc build','gaming pc build 2024','motherboard review','motherboard unboxing','gpu review','graphics card test',
    'nvidia rtx setup','amd gpu build','intel vs amd build','ram upgrade gaming setup','ssd nvme pc build',
    'pc case setup','water cooling pc build','hardware review desk','benchmark gaming setup','pc components setup tour',
    'content creator desk setup','productivity desk setup','home office gaming setup','modded pc battlestation'
  ];
