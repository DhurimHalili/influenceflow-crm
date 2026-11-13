// What a video is about and what a brand sells — one shared list of topics, so
// a creator's content and a brand's catalog can be compared directly.
//
//   • rules first: every topic has words for creator titles/tags and extra words
//     that only count inside a brand's catalog ("case" means a PC case on a
//     hardware store, not in "in case you missed it")
//   • topics belong to families (PC hardware, cars…); families can be related
//     (PC hardware ↔ peripherals). `affinity` says how much a creator who makes
//     one topic suits a brand that sells another: same topic 1, close pairs set
//     by hand (a PC-build channel is a near-perfect home for a case brand),
//     same family 0.6, related family 0.25, else 0.
//   • the AI (Clef) only refines what the rules leave unsure; the scores here
//     always work on their own.
// Pure — shared by the app (web/src/lib/taxonomy.ts) and the edge functions.

export type FamilyKey =
  | "pc" | "computers" | "peripherals" | "setup" | "mobile" | "creator" | "software" | "gaming" | "cars" | "home"
  | "style" | "body" | "life" | "money" | "learn" | "music" | "fun";

export type Topic = {
  key: string;
  label: string;
  family: FamilyKey;
  /** Words in a video title / tag / description lead. */
  words: RegExp;
  /** Extra words that count only in a brand's catalog (product titles, types, collections). */
  catalog?: RegExp;
};

const W = (list: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${list})(?=$|[^\\p{L}\\p{N}])`, "iu");

export const FAMILIES: Record<FamilyKey, { label: string; related: FamilyKey[] }> = {
  pc: { label: "PC hardware", related: ["computers", "peripherals", "setup", "gaming"] },
  computers: { label: "Laptops & mini PCs", related: ["pc", "peripherals", "mobile", "software"] },
  peripherals: { label: "Peripherals & audio", related: ["pc", "computers", "setup", "gaming", "creator"] },
  setup: { label: "Desk setups", related: ["pc", "peripherals", "creator", "home"] },
  mobile: { label: "Phones & gadgets", related: ["computers", "home", "creator"] },
  creator: { label: "Cameras & creator gear", related: ["peripherals", "setup", "mobile"] },
  software: { label: "Software & apps", related: ["computers", "pc"] },
  gaming: { label: "Gaming", related: ["pc", "peripherals"] },
  cars: { label: "Cars", related: [] },
  home: { label: "Home & DIY", related: ["setup", "mobile"] },
  style: { label: "Beauty & fashion", related: ["life"] },
  body: { label: "Fitness & health", related: ["life"] },
  life: { label: "Food, travel & life", related: ["style", "body"] },
  money: { label: "Money", related: ["software"] },
  learn: { label: "Learning", related: ["software"] },
  music: { label: "Music", related: ["creator"] },
  fun: { label: "Entertainment", related: [] },
};

export const TOPICS: Topic[] = [
  // ---- PC hardware ---------------------------------------------------------------
  { key: "pc_builds", label: "PC builds", family: "pc",
    words: W("pc build\\w*|build(?:ing)? (?:a|my|the|this) (?:gaming )?pc|gaming pc|gaming rig|budget (?:gaming )?pc|\\$\\d[\\d,]* (?:gaming )?pc|pc setup|prebuilt|pre-built|build guide|sleeper pc|itx build|white build|pc buyer'?s? guide|pc upgrade|upgrading my pc|battlestation|custom pc|dream pc|pc parts|rgb build|build log"),
    catalog: W("gaming pc|desktop pc|prebuilt|pre-built|custom pc|gaming desktop|pc systems?") },
  { key: "pc_cases", label: "PC cases", family: "pc",
    words: W("pc case|case review|mid[- ]?tower|full[- ]?tower|itx case|m-?atx case|atx case|dual[- ]chamber|fish ?tank case|showcase case|case swap|lian li|o11|fractal (?:design|north|torrent|meshify|terra)|phanteks|nzxt h\\d+|hyte y\\d+|tryx|montech|jonsbo|dark base|pure base|shadow base|corsair \\d{4}[dxt]|ssupd|sliger"),
    catalog: W("cases?|chassis|tower|enclosure") },
  { key: "pc_cooling", label: "PC cooling", family: "pc",
    words: W("aio|liquid cool\\w*|water ?cool\\w*|cpu cooler|air cooler|case fans?|rgb fans?|argb|thermal paste|noctua|arctic|deepcool|thermalright|liquid freezer|custom loop|radiator|pccooler|cryorig|kraken|ek-?wb|cooling|temps|thermal pads?|fan curve"),
    catalog: W("(?:case |pc |cpu |rgb )?fans?(?! (?:club|page|merch))|cpu coolers?|aio|heatsinks?|radiators?|thermal paste|thermal pads?|water blocks?|(?:liquid|water|cpu|pc) cooling|cooling fans?") },
  { key: "pc_power", label: "Power supplies", family: "pc",
    words: W("psu|power supply|power supplies|seasonic|\\d{3,4} ?w psu|atx 3\\.\\d|12vhpwr|12v-2x6|power connector"),
    catalog: W("psu|power suppl\\w+|\\d{3,4} ?w(?:att)?") },
  { key: "gpus", label: "Graphics cards", family: "pc",
    words: W("gpu|gpus|graphics cards?|rtx ?\\d{4}|gtx ?\\d{3,4}|rx ?\\d{4}(?: ?xt)?|radeon|geforce|arc [ab]\\d{3}|50[6789]0(?: ti)?|40[6789]0|90[67]0 ?xt|dlss|fsr ?\\d?|ray tracing|frame gen\\w*|zotac|sapphire|powercolor|xfx"),
    catalog: W("graphics cards?|gpu|geforce|radeon|rtx|video cards?") },
  { key: "cpus_boards", label: "CPUs & motherboards", family: "pc",
    words: W("cpu|cpus|processors?|ryzen|intel core|core ultra|i[3579]-\\d{4,5}k?|\\d{4}x3d|x3d|motherboards?|mobo|b650|x670|x870e?|z790|z890|b850|b860|am5|lga ?1[78]\\d{2}|overclock\\w*|bios"),
    catalog: W("motherboards?|processors?|cpus?|mainboards?") },
  { key: "memory_storage", label: "RAM & storage", family: "pc",
    words: W("ram|ddr[45]|ssd|ssds|nvme|m\\.2|hard drives?|hdd|nas|storage|pny|990 pro|crucial|kingston|wd black|sd cards?|flash drives?|usb drives?|external drive"),
    catalog: W("ssd|nvme|memory (?:kits?|modules?)|ram|ddr[45]|storage|flash drives?|memory cards?|sd cards?|hard drives?|enclosures?") },

  // ---- Laptops & mini PCs --------------------------------------------------------
  { key: "laptops", label: "Laptops", family: "computers",
    words: W("laptops?|notebooks?|macbook\\w*|chromebook|ultrabook|gaming laptop|thinkpad|zephyrus|rog strix|legion|razer blade|thunderobot|xps \\d+|zenbook|surface laptop|framework laptop"),
    catalog: W("laptops?|notebooks?") },
  { key: "mini_pcs", label: "Mini PCs & handhelds", family: "computers",
    words: W("mini ?pc|nuc|steam deck|rog ally|legion go|handheld pc|handheld gaming pc|chuwi|beelink|minisforum|gpd|ayaneo|mac mini|htpc|home ?server|home ?lab|raspberry pi"),
    catalog: W("mini ?pcs?|tablets?|handhelds?") },

  // ---- Peripherals & audio -------------------------------------------------------
  { key: "monitors", label: "Monitors", family: "peripherals",
    words: W("monitors?|oled monitor|ultrawide|4k monitor|\\d{3}hz|qd-?oled|mini-?led|portable monitor|gaming monitor|display review"),
    catalog: W("monitors?|displays?|screens?") },
  { key: "keyboards", label: "Keyboards", family: "peripherals",
    words: W("keyboards?|keycaps?|keyboard switches|mechanical keyboard|hall effect|tkl|65% keyboard|75% keyboard|keychron|wooting|custom keyboard|keeb\\w*|thock"),
    catalog: W("keyboards?|keycaps?|switches") },
  { key: "mice", label: "Mice & mousepads", family: "peripherals",
    words: W("gaming mouse|mouse review|mice|mousepads?|mouse ?pad|desk ?mat|glorious|finalmouse|lamzu|pulsar|superlight|viper v\\d|deathadder"),
    catalog: W("mouse|mice|mouse ?pads?|desk ?mats?") },
  { key: "audio", label: "Headsets & audio", family: "peripherals",
    words: W("headphones?|headsets?|earbuds|iems?|airpods|speakers?|soundbar|dac|audiophile|hyperx cloud|arctis|microphones?|xlr mic|usb mic|shure|rode|blue yeti|noise cancell\\w*|spatial audio"),
    catalog: W("headphones?|headsets?|earbuds|speakers?|microphones?|mics?|audio|soundbars?|dacs?|amplifiers?") },

  // ---- Desk setups ---------------------------------------------------------------
  { key: "desk_furniture", label: "Desks & chairs", family: "setup",
    words: W("desk setup|desk tour|setup tour|standing desk|gaming chair|office chair|ergonomic\\w*|cable management|secretlab|flexispot|sihoo|autonomous|herman miller|monitor arm|workspace|home office|dream setup|setup makeover|clean setup"),
    catalog: W("desks?|chairs?|standing desks?|monitor arms?|footrests?|desk accessories|ergonomic\\w*|furniture") },
  { key: "lighting", label: "RGB & lighting", family: "setup",
    words: W("rgb|led strips?|light ?bars?|govee|philips hue|nanoleaf|ambient lighting|smart lights?|smart lamps?|lighting setup"),
    catalog: W("lights?|lamps?|led|lighting|light strips?|bulbs?") },

  // ---- Phones & gadgets ----------------------------------------------------------
  { key: "phones", label: "Phones & tablets", family: "mobile",
    words: W("iphone\\w*|android|smartphones?|phones?|galaxy s\\d+|galaxy z|pixel \\d+|oneplus|xiaomi|nothing phone|ipad\\w*|tablets?|foldables?|z fold|z flip"),
    catalog: W("phones?|phone cases|screen protectors?|tablets?") },
  { key: "wearables", label: "Wearables", family: "mobile",
    words: W("smart ?watch\\w*|apple watch|galaxy watch|garmin|fitbit|oura|whoop|smart ring|wearables?"),
    catalog: W("watches|smart ?watch\\w*|rings?|bands?|wearables?") },
  { key: "charging", label: "Charging & power", family: "mobile",
    words: W("chargers?|power banks?|powerbanks?|gan charger|magsafe|wireless charg\\w*|power stations?|anker|ugreen|pecron|ecoflow|jackery|bluetti|solar generator|portable power"),
    catalog: W("chargers?|charging|power banks?|power stations?|batter(?:y|ies)|cables?|adapters?|solar") },
  { key: "connectivity", label: "Docks, hubs & networking", family: "mobile",
    words: W("usb-?c hubs?|docking stations?|docks?|kvm|thunderbolt dock|routers?|mesh wi-?fi|wi-?fi \\d|networking|ethernet|nas|av access|orico|hdmi switch|capture card"),
    catalog: W("hubs?|docks?|docking|kvm|switch(?:es|ers)?|routers?|adapters?|cables?|extenders?|splitters?") },

  // ---- Cameras & creator gear ----------------------------------------------------
  { key: "cameras", label: "Cameras & photo", family: "creator",
    words: W("cameras?|lens(?:es)?|mirrorless|dslr|sony a7\\w*|fx3|fx30|zv-e\\d+|canon r\\d+|lumix|fujifilm|x100\\w*|gopro|insta360|dji|drones?|gimbals?|tripods?|joby|nd filters?|kentfaith|photography|filmmaking|cinematic|b-?roll"),
    catalog: W("cameras?|lens(?:es)?|filters?|tripods?|gimbals?|drones?|mounts?|camera bags?|photography") },
  { key: "creator_gear", label: "Streaming & creator gear", family: "creator",
    words: W("streaming setup|stream deck|elgato|capture card|webcams?|ring lights?|key lights?|teleprompter|green screen|obs|youtube setup|creator gear|rodecaster|goxlr|podcast setup|studio setup"),
    catalog: W("webcams?|stream decks?|capture cards?|ring lights?|teleprompters?|green screens?") },

  // ---- Software & apps -----------------------------------------------------------
  { key: "software", label: "Software & apps", family: "software",
    words: W("software|apps?|saas|productivity|notion|windows 1[01]|windows tips|excel|chrome extensions?|browser|mac apps?|iphone apps?|android apps?|app review"),
    catalog: W("software|apps?|subscription|platform|plugins?|extensions?|licen[cs]es?") },
  { key: "ai_tools", label: "AI tools", family: "software",
    words: W("ai|chatgpt|openai|gpt-?\\d\\w*|claude|gemini|llms?|midjourney|copilot|ai tools?|ai agents?|stable diffusion|ai video|ai voice|voice ai|dictation|wispr|perplexity|artificial intelligence"),
    catalog: W("ai|artificial intelligence|machine learning|assistant|dictation") },
  { key: "privacy", label: "VPN, privacy & security", family: "software",
    words: W("vpn|nordvpn|expressvpn|surfshark|privacy|data removal|data brokers?|deleteme|incogni|aura|antivirus|malware|cyber ?security|password managers?|hack(?:ed|ers?|ing)?|scams?|identity theft"),
    catalog: W("vpn|privacy|security|antivirus|data removal|identity|password") },
  { key: "game_keys", label: "Game & software keys", family: "software",
    words: W("cd ?keys?|game keys?|windows keys?|license keys?|office keys?|cheap windows|steam keys?|gift cards?|g2a|kinguin|eneba|cdkeys|scdkey|gvgmall|winprokeys"),
    catalog: W("keys?|licen[cs]es?|activation|gift cards?|windows 1[01]|office 20\\d\\d") },
  { key: "web_hosting", label: "Websites & hosting", family: "software",
    words: W("website builder|web hosting|hosting|domain names?|squarespace|wix|hostinger|bluehost|wordpress|online store|build a website"),
    catalog: W("hosting|domains?|website builder|websites?") },

  // ---- Gaming --------------------------------------------------------------------
  { key: "games", label: "Games & gameplay", family: "gaming",
    words: W("gameplay|playthrough|walkthrough|let'?s play|gaming(?! (?:pcs?|laptops?|chairs?|monitors?|mouse|mice|keyboards?|headsets?|headphones|setups?|desks?|rigs?|routers?|phones?|tablets?|handhelds?|glasses|earbuds|gear|accessories|peripherals|furniture|equipment|products|brands?|computers?|desktops?|systems?|builds?|keys?))|gamers?|minecraft|fortnite|roblox|gta ?\\w*|elden ring|call of duty|warzone|valorant|cs2|counter-?strike|apex|zelda|pok[eé]mon|speedrun\\w*|esports?|game review|best games|cyberpunk|fps test|benchmarks? in \\d+ games"),
    catalog: W("video games?|board games?|games?(?= (?:for|on) (?:pc|ps5|xbox|switch))") },
  { key: "consoles", label: "Consoles & controllers", family: "gaming",
    words: W("ps5|ps4|playstation|xbox\\w*|nintendo|switch 2|consoles?|controllers?|dualsense|8bitdo|gamesir|joy-?cons?"),
    catalog: W("controllers?|gamepads?|consoles?|joysticks?") },
  { key: "sim_racing", label: "Sim racing", family: "gaming",
    words: W("sim ?racing|racing sim\\w*|sim rigs?|fanatec|moza|simagic|asetek|thrustmaster|direct drive|cockpits?|iracing|assetto corsa|gran turismo|racing wheels?|pedals|simsonn|wheel ?base|load cell"),
    catalog: W("wheel ?bases?|racing wheels?|pedals|cockpits?|rigs?|shifters?|handbrakes?|steering wheels?") },
  { key: "retro", label: "Retro gaming", family: "gaming",
    words: W("retro|snes|n64|gamecube|game ?boy|sega|dreamcast|ps1|ps2|emulat\\w+|arcade|crt|anbernic|miyoo|retroid"),
    catalog: W("retro|handhelds?|arcade") },

  // ---- Cars ----------------------------------------------------------------------
  { key: "car_reviews", label: "Car reviews", family: "cars",
    words: W("car reviews?|test drive|walkaround|supercars?|sports cars?|ferrari|lamborghini|porsche|mclaren|bmw|mercedes|audi|toyota|honda|ford|chevy|corvette|mustang|trucks?|suvs?|0-60|top speed|hypercars?|car buying|new cars?|used cars?|dream cars?|my car|this car|cars (?:and|&) coffee|car (?:show|meet)s?"),
    catalog: W("cars?|vehicles?") },
  { key: "ev", label: "Electric cars", family: "cars",
    words: W("evs?|electric cars?|electric vehicles?|tesla|model [3ysx]|cybertruck|rivian|lucid|polestar|byd|ioniq|mach-?e|range test|autopilot|fsd|hybrid"),
    catalog: W("tesla|ev|electric vehicles?") },
  { key: "ev_charging", label: "EV charging", family: "cars",
    words: W("ev chargers?|ev charging|level 2 charg\\w*|j1772|nacs|ccs|wallbox|supercharg\\w*|charging stations?|charging network|home charging|electrify america|chargepoint|ionna|lectron|evbase|range anxiety"),
    catalog: W("ev chargers?|charging stations?|j1772|nacs|ccs|level 2|adapters?|extension cords?|wall ?connectors?") },
  { key: "car_accessories", label: "Car accessories & tech", family: "cars",
    words: W("dash ?cams?|carplay|android auto|car accessories|car gadgets?|floor mats?|floor liners?|seat covers?|tire inflators?|jump starters?|obd\\w*|car scanners?|car mounts?|phone mounts?|tesla accessories|s3xy|car tech|car vacuums?|viofo|wolfbox|fanttik|ancel|carlinkit|jowua|car organi[sz]ers?"),
    catalog: W("dash ?cams?|carplay|floor (?:mats?|liners?)|seat covers?|inflators?|jump starters?|scanners?|obd\\w*|car mounts?|organi[sz]ers?|car accessories|cargo liners?") },
  { key: "car_care", label: "Car care & detailing", family: "cars",
    words: W("detailing|car wash|ceramic coating|ppf|car wraps?|vinyl wrap|polish\\w*|wax|oil change|motor oil|valvoline|car care|interior clean\\w*|paint correction|chemical guys|meguiar'?s"),
    catalog: W("wax|polish|ceramic|coatings?|shampoo|cleaners?|microfib(?:er|re)|motor oil|oils?|detailing") },
  { key: "car_parts", label: "Car parts & tuning", family: "cars",
    words: W("car parts|tuning|turbo\\w*|exhaust|intake|alloy wheels|rims|suspension|coilovers|engine swap|engine build|restoration|project car|car mods|modified car|dyno|engine parts|brake (?:job|pads|upgrade)|ls swap|2jz"),
    catalog: W("car parts|auto parts|exhausts?|intakes?|turbos?|rims?|coilovers?|brake (?:pads|rotors|kits?|calipers)|spark plugs?|oil filters?|air filters?|composites?|fiberglass|resin|carbon fib(?:er|re)|body kits?|spoilers?") },
  { key: "motorsport", label: "Motorsport", family: "cars",
    words: W("f1|formula ?1|motorsport|nascar|track days?|rally|drift\\w*|le mans|indycar|motogp|karting"),
    catalog: W("motorsport|race (?:cars?|teams?)|karting|racing (?:suits?|helmets?|seats?|gloves)") },
  { key: "e_mobility", label: "E-bikes & scooters", family: "cars",
    words: W("e-?bikes?|electric bikes?|electric scooters?|e-?scooters?|onewheel|electric skateboards?|unicycles?"),
    catalog: W("e-?bikes?|scooters?|electric bikes?") },

  // ---- Home & DIY ----------------------------------------------------------------
  { key: "smart_home", label: "Smart home", family: "home",
    words: W("smart home|home assistant|alexa|google home|homekit|robot vacuums?|security cameras?|ring doorbell|video doorbell|smart locks?|smart plugs?|matter|home automation"),
    catalog: W("smart home|smart plugs?|cameras?|doorbells?|locks?|sensors?|robot vacuums?") },
  { key: "home_appliances", label: "Home & kitchen", family: "home",
    words: W("vacuums?|robot vacuums?|air purifiers?|kitchen gadgets?|appliances?|air fryers?|coffee machines?|espresso machines?|blenders?|dyson|roomba|home tour|apartment tour|cleaning|washing machines?|dishwashers?"),
    catalog: W("vacuums?|purifiers?|kitchen|appliances?|cookware|coffee makers?|espresso machines?|air fryers?|cleaning|cleaners?|humidifiers?|fans|heaters?") },
  { key: "diy_tools", label: "Tools, DIY & 3D printing", family: "home",
    words: W("diy|power tools?|hand tools|tool reviews?|tool kits?|toolbox|drills?|impact driver|saws?|woodworking|workshop|3d print\\w*|bambu|prusa|laser engraver|cnc|soldering|electronics projects?|arduino|maker|fiberglass|composites?|epoxy|resin"),
    catalog: W("tools?|drills?|saws?|3d printers?|filament|lasers?|soldering|kits?|workbench") },

  // ---- Lifestyle (coarser) ---------------------------------------------------------
  { key: "beauty", label: "Beauty & skincare", family: "style", words: W("makeup|skin ?care|beauty|grwm|lipstick|foundation|serums?|nails|nail polish|lashes|sunscreen|spf"), catalog: W("skin ?care|makeup|serums?|creams?|cleansers?|moisturi[sz]ers?|cosmetics|lip\\w*|mascara|sunscreen") },
  { key: "fashion", label: "Fashion & accessories", family: "style", words: W("outfits?|haul|streetwear|style|lookbook|sneakers?|fashion|try on|ootd|thrift\\w*|menswear|edc|wallets?|underwear|socks"), catalog: W("shirts?|t-shirts?|hoodies?|jackets?|shoes|sneakers?|apparel|clothing|wallets?|bags?|backpacks?|underwear|socks|jeans|dresses|hats?|caps?|sunglasses") },
  { key: "fitness", label: "Fitness", family: "body", words: W("workouts?|gym|fitness|bodybuilding|calisthenics|yoga|running|marathon|weight loss|training|hiit|home gym|treadmill"), catalog: W("dumbbells?|weights|treadmills?|yoga mats?|fitness|gym|resistance bands?") },
  { key: "nutrition", label: "Nutrition & supplements", family: "body", words: W("protein|supplements?|creatine|pre-?workout|vitamins|electrolytes|energy drinks?|ag1|athletic greens|meal replacement"), catalog: W("protein|supplements?|vitamins|powders?|capsules|electrolytes|gummies") },
  { key: "health", label: "Health & wellness", family: "body", words: W("health|wellness|posture|dentist|teeth|doctors?|telehealth|blood tests?|testosterone|hormones?|hearing aids?|glasses|contacts lenses|zocdoc|hims|hers|hone health"), catalog: W("health|wellness|telehealth|doctors?|clinics?|lab tests?|prescriptions?|hearing|vision|dental|toothbrush\\w*|teeth") },
  { key: "sports", label: "Sports", family: "body", words: W("football|soccer|nba|basketball|nfl|golf|tennis|ufc|mma|boxing|cycling|skateboard\\w*|surf\\w*|ski\\w*|snowboard\\w*"), catalog: W("golf|tennis|cycling|bikes?|skateboards?|balls?|rackets?") },
  { key: "food", label: "Food & cooking", family: "life", words: W("recipes?|cooking|baking|food|kitchen|chefs?|meal prep|mukbang|restaurants?|taste tests?|snacks?|bbq|grill\\w*"), catalog: W("snacks?|sauces?|spices?|food|meals?|grills?|knives") },
  { key: "travel", label: "Travel", family: "life", words: W("travel\\w*|trips?|vacation|hotels?|flights?|airports?|backpacking|luggage|van ?life|city guide|things to do"), catalog: W("luggage|suitcases?|travel|carry-?on") },
  { key: "outdoors", label: "Outdoors", family: "life", words: W("camping|fishing|hunting|hiking|bushcraft|survival|overlanding|kayak\\w*|outdoor gear|tents?"), catalog: W("tents?|camping|fishing|knives|flashlights?|outdoor") },
  { key: "pets", label: "Pets", family: "life", words: W("dogs?|cats?|puppy|kittens?|pets?|aquarium"), catalog: W("pets?|dogs?|cats?|leash|collars?") },
  { key: "kids_family", label: "Kids & family", family: "life", words: W("kids|toys?|baby|family vlog|parenting|toddlers?|lego"), catalog: W("toys?|kids|baby|lego") },
  { key: "finance", label: "Money & finance", family: "money", words: W("investing|stocks?|money|budget\\w*|side hustles?|real estate|passive income|trading|finance|wealth|credit cards?|banking|savings|cash ?back|taxes"), catalog: W("invest\\w*|banking|budget\\w*|credit|cash ?back|trading|finance|money") },
  { key: "education", label: "Learning & science", family: "learn", words: W("science|history|math|physics|chemistry|biology|documentary|lessons?|study tips|explained|engineering|space|astronomy"), catalog: W("learning|science kits?|educational") },
  { key: "music_gear", label: "Music & instruments", family: "music", words: W("guitars?|pianos?|synths?|drums|bass|music production|producers?|daw|ableton|fl studio|audio interfaces?|pedals?|amps?|studio monitors"), catalog: W("guitars?|pianos?|synths?|drums|instruments?|pedals?|audio interfaces?|midi") },
  // ---- added: what brands sponsor that the first list missed ------------------------------
  { key: "grooming", label: "Grooming & haircare", family: "style", words: W("grooming|shav\\w+|beard\\w*|trimmers?|razors?|hair ?care|haircuts?|hairstyles?|manscaped|hair loss|balding|barber\\w*|deodorant|body wash"), catalog: W("razors?|trimmers?|shavers?|shampoo|conditioner|beard\\w*|hair ?care|deodorants?|body wash|grooming") },
  { key: "watches_jewelry", label: "Watches & jewelry", family: "style", words: W("watch(?:es)? (?:review|collection)|wrist ?watch\\w*|rolex|seiko|omega|casio|g-?shock|tissot|horology|jewel(?:le)?ry|necklaces?|bracelets?|chains?|rings? review"), catalog: W("watches|watch straps?|jewel(?:le)?ry|necklaces?|bracelets?|rings|earrings|chains?|pendants?") },
  { key: "fragrance", label: "Fragrance", family: "style", words: W("fragrances?|perfumes?|colognes?|scents?|smell good"), catalog: W("fragrances?|perfumes?|colognes?|eau de (?:parfum|toilette)|scents?") },
  { key: "sleep", label: "Sleep & mattresses", family: "body", words: W("sleep\\w*|mattress\\w*|pillows?|insomnia|naps?|bedroom|helix|eight sleep|purple mattress"), catalog: W("mattress\\w*|pillows?|bedding|sheets|duvets?|sleep\\w*|beds?") },
  { key: "mental_health", label: "Mental health & therapy", family: "body", words: W("mental health|therapy|therapists?|betterhelp|talkspace|meditat\\w+|mindfulness|anxiety|depression|burnout|calm app|headspace|journaling"), catalog: W("therapy|therapists?|counsel\\w+|meditation|mindfulness|mental health") },
  { key: "meal_kits", label: "Meal kits & food delivery", family: "life", words: W("hellofresh|hello fresh|factor meals?|green chef|home ?chef|everyplate|meal kits?|meal delivery|food delivery|uber ?eats|doordash|deliveroo|just eat"), catalog: W("meal kits?|meals delivered|ready-?made meals|meal plans?|recipe boxes?|food delivery") },
  { key: "drinks", label: "Drinks & coffee", family: "life", words: W("coffee(?! (?:machines?|makers?))|energy drinks?|pre-?workout drinks?|beers?|wines?|whiske?y|cocktails?|tea|matcha|sodas?|electrolytes?|hydration|liquid i\\.?v\\.?"), catalog: W("coffee(?! (?:machines?|makers?))|beans|tea|matcha|energy drinks?|drinks?|beverages?|beers?|wines?|spirits|electrolytes?|hydration") },
  { key: "shopping", label: "Shopping & marketplaces", family: "life", words: W("temu|aliexpress|shein|ebay|whatnot|amazon finds|amazon must-?haves|wish haul|marketplace finds|online shopping|deals? haul"), catalog: W("marketplace|online shopping|discount store|auctions?|resale") },
  { key: "home_decor", label: "Home decor & art", family: "home", words: W("home d[eé]cor|wall art|interior design|room makeover|room tour|posters?|art prints?|displate|candles?|rugs?|house ?plants?"), catalog: W("home d[eé]cor|wall art|posters?|prints|canvas prints?|picture frames|candles?|rugs?|vases?|metal posters?") },
  { key: "garden", label: "Garden & yard", family: "home", words: W("garden\\w*|lawn\\w*|mowers?|yard work|backyard|greenhouse|landscaping|pressure wash\\w*|leaf blowers?|hedge trimmers?"), catalog: W("garden\\w*|lawn\\w*|mowers?|seeds|planters?|hoses?|pressure washers?|leaf blowers?|outdoor furniture") },
  { key: "home_security", label: "Home security", family: "home", words: W("security cam\\w*|doorbell cam\\w*|video doorbells?|simplisafe|ring doorbell|alarm systems?|smart locks?|home security|safes?"), catalog: W("security cameras?|doorbells?|alarms?|smart locks?|locks|safes?|home security|sensors?") },
  { key: "portable_power", label: "Power stations & solar", family: "home", words: W("power stations?|portable power|solar (?:panels?|generators?|power|setup)|ecoflow|bluetti|jackery|anker solix|home batter(?:y|ies)|backup power|off-?grid|generators?|power outage"), catalog: W("power stations?|portable power|solar (?:panels?|generators?)|generators?|batter(?:y|ies) backup|home batter(?:y|ies)|inverters?") },
  { key: "crypto", label: "Crypto", family: "money", words: W("crypto\\w*|bitcoin|btc|ethereum|eth|blockchain|nfts?|web3|coinbase|binance|kraken|ledger wallet|altcoins?|defi|memecoins?"), catalog: W("crypto\\w*|bitcoin|blockchain|hardware wallets?|crypto wallets?|staking") },
  { key: "insurance_loans", label: "Insurance & loans", family: "money", words: W("insurance|insurers?|loans?|mortgages?|debt relief|debt free|credit repair|refinanc\\w+|credit scores?|car finance|consolidat\\w+"), catalog: W("insurance|insurers?|loans?|mortgages?|debt|credit|refinanc\\w+") },
  { key: "courses", label: "Online courses & coding", family: "learn", words: W("skillshare|brilliant|masterclass|coursera|udemy|boot\\.?dev|codecademy|online courses?|learn to code|coding (?:course|bootcamp)|bootcamps?|certifications?"), catalog: W("courses?|classes|lessons?|bootcamps?|certifications?|tutorials?|learn to code") },
  { key: "languages", label: "Language learning", family: "learn", words: W("babbel|duolingo|rosetta stone|busuu|pimsleur|italki|language learning|learn(?:ing)? (?:spanish|french|german|japanese|korean|chinese|italian|english)|polyglot"), catalog: W("language (?:learning|courses?|lessons?)|learn (?:spanish|french|german|japanese|korean|english)") },
  { key: "books", label: "Books & audiobooks", family: "learn", words: W("books?|audiobooks?|audible|kindle|book reviews?|reading list|novels?|blinkist|booktube|what i read"), catalog: W("books?|audiobooks?|e-?books?|novels?|reading|summaries") },
  { key: "productivity", label: "Productivity & business tools", family: "software", words: W("productivity|notion|obsidian|to-?do (?:apps?|lists?)|calendar apps?|project management|note-?taking|shopify|e-?commerce|dropshipping|email marketing|invoic\\w+|freelanc\\w+|small business|crm"), catalog: W("productivity|project management|workspace|notes?|e-?commerce|online store builder|invoic\\w+|accounting|payroll|email marketing|crm|scheduling") },
  { key: "mobile_games", label: "Mobile games", family: "gaming", words: W("mobile games?|mobile gaming|raid:? shadow legends|rise of kingdoms|genshin|hero wars|candy crush|clash of clans|clash royale|gacha|afk arena|honkai|monopoly go|royal match|state of survival|call of dragons|lords mobile"), catalog: W("mobile games?|free to play|play on (?:ios|android)|download (?:on|for) (?:ios|android)") },
  { key: "streaming_tv", label: "Streaming & TV", family: "fun", words: W("netflix|disney\\+|hbo|max original|prime video|apple tv|crunchyroll|anime|tv shows?|series review|movie reviews?|trailers?|streaming services?"), catalog: W("streaming|series|movies?|shows?|anime") },
  { key: "toys_collectibles", label: "Toys, LEGO & collectibles", family: "fun", words: W("lego|toys?|collectibles?|action figures?|funko|trading cards?|pok[eé]mon cards|tcg|card openings?|pack openings?|model kits?|gunpla|hot wheels|diecast"), catalog: W("lego|toys?|collectibles?|figures?|trading cards?|booster packs?|model kits?|diecast|plush\\w*") },
  { key: "phone_plans", label: "Phone plans & eSIM", family: "mobile", words: W("e-?sims?|mobile plans?|phone plans?|mint mobile|visible wireless|saily|airalo|holafly|data plans?|unlimited data|sim cards?|roaming"), catalog: W("e-?sims?|mobile plans?|phone plans?|data plans?|sim cards?|unlimited data|roaming") },
  { key: "drones", label: "Drones", family: "creator", words: W("drones?|fpv|dji (?:mini|air|mavic|avata|neo|flip)|quadcopters?|aerial (?:footage|shots?|photography)"), catalog: W("drones?|fpv|quadcopters?|propellers?|gimbals?") },
  { key: "car_buying", label: "Buying & selling cars", family: "cars", words: W("car buying|buying (?:a|my) (?:used |new )?cars?|used cars?|car auctions?|auctions?|dealerships?|dealers?|carvertical|vin (?:check|decoder)|history reports?|carvana|cars (?:&|and) bids|bring a trailer|trade-?ins?|sell(?:ing)? my car|car prices?|cheapest cars?"), catalog: W("used cars?|car history|vin|vehicle history|auctions?|car finance|dealers?|buy a car|sell your car|car valuations?") },
  { key: "motorcycles", label: "Motorcycles", family: "cars", words: W("motorcycles?|motorbikes?|sport ?bikes?|harley|ducati|kawasaki|triumph|ktm|dirt ?bikes?|motovlog\\w*|riding gear|track day on (?:a|my) bike"), catalog: W("motorcycles?|motorbikes?|riding gear|motorcycle helmets?|leathers") },
  { key: "entertainment", label: "Entertainment & vlogs", family: "fun", words: W("comedy|funny|sketch|pranks?|reacts?|reaction|challenges?|memes?|podcast|vlogs?|commentary|drama|news"), catalog: W("entertainment|streaming|movies?|shows?") },
];

export const TOPIC = new Map(TOPICS.map((t) => [t.key, t]));
export const topicLabel = (key: string) => TOPIC.get(key)?.label || "Other";
export const familyOf = (key: string): FamilyKey | null => TOPIC.get(key)?.family || null;

// Close pairs: a creator who makes `a` is almost a native home for a brand that sells `b`.
const CLOSE: [string, string, number][] = [
  ["pc_builds", "pc_cases", 0.9], ["pc_builds", "pc_cooling", 0.9], ["pc_builds", "gpus", 0.85], ["pc_builds", "cpus_boards", 0.85],
  ["pc_builds", "memory_storage", 0.8], ["pc_builds", "pc_power", 0.85], ["pc_cases", "pc_cooling", 0.8], ["pc_cooling", "pc_power", 0.65],
  ["gpus", "cpus_boards", 0.7], ["pc_builds", "game_keys", 0.55], ["pc_builds", "lighting", 0.5], ["pc_builds", "desk_furniture", 0.5],
  ["desk_furniture", "keyboards", 0.6], ["desk_furniture", "mice", 0.6], ["desk_furniture", "monitors", 0.65], ["desk_furniture", "lighting", 0.7], ["desk_furniture", "audio", 0.45],
  ["keyboards", "mice", 0.75], ["monitors", "gpus", 0.5], ["monitors", "games", 0.4], ["audio", "creator_gear", 0.55], ["mice", "games", 0.45], ["keyboards", "games", 0.35],
  ["laptops", "mini_pcs", 0.7], ["laptops", "software", 0.4], ["mini_pcs", "connectivity", 0.55], ["laptops", "connectivity", 0.5], ["mini_pcs", "retro", 0.5], ["mini_pcs", "games", 0.45],
  ["phones", "wearables", 0.65], ["phones", "charging", 0.7], ["charging", "connectivity", 0.6], ["phones", "cameras", 0.4], ["connectivity", "monitors", 0.45],
  ["cameras", "creator_gear", 0.75], ["creator_gear", "lighting", 0.5],
  ["software", "ai_tools", 0.7], ["software", "privacy", 0.55], ["software", "web_hosting", 0.55], ["software", "game_keys", 0.55], ["ai_tools", "privacy", 0.35],
  ["games", "consoles", 0.65], ["games", "game_keys", 0.7], ["games", "sim_racing", 0.45], ["retro", "consoles", 0.65], ["retro", "games", 0.6], ["sim_racing", "motorsport", 0.6], ["sim_racing", "car_reviews", 0.35],
  ["ev", "ev_charging", 0.9], ["ev", "car_accessories", 0.7], ["ev", "car_reviews", 0.7], ["car_reviews", "car_accessories", 0.6], ["car_reviews", "car_care", 0.6], ["car_reviews", "car_parts", 0.6],
  ["car_parts", "car_care", 0.6], ["car_parts", "diy_tools", 0.5], ["car_care", "car_accessories", 0.6], ["motorsport", "car_reviews", 0.6], ["ev_charging", "charging", 0.4], ["e_mobility", "ev", 0.45],
  ["smart_home", "home_appliances", 0.6], ["smart_home", "lighting", 0.6], ["smart_home", "connectivity", 0.5], ["diy_tools", "home_appliances", 0.4], ["charging", "outdoors", 0.45],
  ["fitness", "nutrition", 0.8], ["fitness", "wearables", 0.55], ["fitness", "health", 0.6], ["nutrition", "health", 0.6], ["sports", "fitness", 0.6], ["beauty", "fashion", 0.55],
  ["grooming", "beauty", 0.7], ["fragrance", "beauty", 0.65], ["fragrance", "grooming", 0.55], ["watches_jewelry", "fashion", 0.7], ["grooming", "fashion", 0.35],
  ["sleep", "health", 0.6], ["mental_health", "health", 0.65], ["sleep", "mental_health", 0.45], ["meal_kits", "food", 0.8], ["drinks", "food", 0.55], ["drinks", "nutrition", 0.45],
  ["shopping", "fashion", 0.35], ["shopping", "home_appliances", 0.35], ["home_decor", "home_appliances", 0.5], ["home_decor", "desk_furniture", 0.45], ["garden", "diy_tools", 0.55], ["garden", "outdoors", 0.4],
  ["home_security", "smart_home", 0.75], ["portable_power", "charging", 0.6], ["portable_power", "outdoors", 0.6], ["portable_power", "ev_charging", 0.4], ["portable_power", "smart_home", 0.35],
  ["crypto", "finance", 0.7], ["insurance_loans", "finance", 0.65], ["courses", "education", 0.75], ["courses", "software", 0.45], ["languages", "education", 0.6], ["languages", "courses", 0.6], ["languages", "travel", 0.4], ["books", "education", 0.55],
  ["productivity", "software", 0.7], ["productivity", "ai_tools", 0.55], ["productivity", "web_hosting", 0.55], ["mobile_games", "games", 0.7], ["streaming_tv", "entertainment", 0.7], ["toys_collectibles", "kids_family", 0.6], ["toys_collectibles", "games", 0.35],
  ["phone_plans", "phones", 0.7], ["phone_plans", "travel", 0.45], ["drones", "cameras", 0.75], ["drones", "creator_gear", 0.5], ["drones", "travel", 0.35],
  ["car_buying", "car_reviews", 0.75], ["car_buying", "insurance_loans", 0.35], ["motorcycles", "car_reviews", 0.45], ["motorcycles", "e_mobility", 0.4], ["motorcycles", "motorsport", 0.45],
  ["food", "home_appliances", 0.5], ["travel", "outdoors", 0.5], ["travel", "cameras", 0.45], ["finance", "software", 0.35], ["education", "software", 0.35], ["music_gear", "audio", 0.6], ["music_gear", "creator_gear", 0.45],
];
const close = new Map<string, number>();
for (const [a, b, v] of CLOSE) { close.set(`${a}|${b}`, v); close.set(`${b}|${a}`, v); }

/** How well a creator who makes `creatorTopic` suits a brand that sells `brandTopic` (0..1). */
export function affinity(creatorTopic: string, brandTopic: string): number {
  if (creatorTopic === brandTopic) return 1;
  const pair = close.get(`${creatorTopic}|${brandTopic}`);
  if (pair !== undefined) return pair;
  const a = familyOf(creatorTopic), b = familyOf(brandTopic);
  if (!a || !b) return 0;
  if (a === b) return 0.6;
  if (FAMILIES[a].related.includes(b) || FAMILIES[b].related.includes(a)) return 0.25;
  return 0;
}

export type Weights = Record<string, number>;

/** Topic scores for one piece of text (a video, a product). Keys with score > 0 only. */
export function scoreText(parts: { text: string; weight: number }[], opts: { catalog?: boolean } = {}): Weights {
  const out: Weights = {};
  for (const t of TOPICS) {
    let s = 0;
    for (const p of parts) {
      if (!p.text) continue;
      if (t.words.test(p.text)) s += p.weight;
      else if (opts.catalog && t.catalog && t.catalog.test(p.text)) s += p.weight * 0.9;
    }
    if (s > 0) out[t.key] = Math.round(s * 100) / 100;
  }
  return out;
}

/**
 * The topics of one video: title counts most, then tags and the first lines of
 * the description. Shares add up to 1; [] when nothing is clear.
 */
export function videoTopics(v: { title: string; tags?: string[]; lead?: string }): { key: string; share: number }[] {
  // Each tag counts on its own (three keyboard tags say more than one), the title most.
  const tags = (v.tags || []).slice(0, 15).map((text) => ({ text, weight: 0.45 }));
  const raw = scoreText([{ text: v.title || "", weight: 2 }, ...tags, { text: (v.lead || "").slice(0, 320), weight: 0.6 }]);
  // A word the title doesn't back up needs two sources (tags + lead) to count.
  const kept = Object.entries(raw).filter(([, s]) => s >= 1.2);
  if (!kept.length) return [];
  const best = Math.max(...kept.map(([, s]) => s));
  // Weak side topics (well under the main one) are dropped, so one stray tag doesn't split a video.
  const strong = kept.filter(([, s]) => s >= best * 0.45);
  const sum = strong.reduce((n, [, s]) => n + s, 0);
  return strong.map(([key, s]) => ({ key, share: Math.round((s / sum) * 100) / 100 })).sort((a, b) => b.share - a.share).slice(0, 3);
}

export type ContentVideo = { id: string; title: string; at: string; secs: number; topics: { key: string; share: number }[] };
export type ContentProfile = {
  v: number;
  at: string;
  /** Videos read (long + shorts) and how many had a clear topic. */
  videos: number;
  clear: number;
  shorts: number;
  /** Share of their recent content per topic (0..1, sums to ≤ 1), biggest first. */
  topics: { key: string; share: number; videos: number }[];
  /** Up to 3 recent titles per top topic — "why we think so". */
  examples: Record<string, string[]>;
  newest: string;
  /** "rules" or "rules+ai" (Clef checked the unclear ones). */
  by: string;
};
export const CONTENT_VERSION = 2;

/**
 * A creator's content mix from their latest videos. Newer videos weigh more
 * (a year-old video half as much), Shorts 40% of a long video. Videos with no
 * clear topic still count in the total, so a channel that is half unclear
 * can't look 100% "PC builds" from two titles.
 */
export function contentProfile(videos: ContentVideo[], now: Date, by = "rules"): ContentProfile {
  const sorted = [...videos].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  const acc = new Map<string, { w: number; n: number }>();
  const examples: Record<string, string[]> = {};
  let total = 0;
  for (const v of sorted) {
    const ageDays = Math.max(0, (now.getTime() - new Date(v.at).getTime()) / 86400000);
    const w = (1 - Math.min(0.5, ageDays / 730)) * (v.secs > 0 && v.secs <= 180 ? 0.4 : 1);
    total += w;
    for (const t of v.topics) {
      const row = acc.get(t.key) || { w: 0, n: 0 };
      row.w += w * t.share; row.n += 1;
      acc.set(t.key, row);
      if (t.share >= 0.4) (examples[t.key] ||= []).length < 3 && examples[t.key].push(v.title.slice(0, 120));
    }
  }
  const topics = Array.from(acc.entries())
    .map(([key, r]) => ({ key, share: total ? Math.round((r.w / total) * 1000) / 1000 : 0, videos: r.n }))
    .filter((t) => t.share >= 0.02)
    .sort((a, b) => b.share - a.share)
    .slice(0, 14);
  const keep = new Set(topics.map((t) => t.key));
  for (const k of Object.keys(examples)) if (!keep.has(k)) delete examples[k];
  return {
    v: CONTENT_VERSION, at: now.toISOString(), videos: sorted.length, clear: sorted.filter((v) => v.topics.length).length,
    shorts: sorted.filter((v) => v.secs > 0 && v.secs <= 180).length, topics, examples, newest: sorted[0]?.at || "", by,
  };
}

/** Share of a creator's content per family ("PC hardware 82%"). */
export function familyShares(topics: { key: string; share: number }[]): { family: FamilyKey; share: number }[] {
  const m = new Map<FamilyKey, number>();
  for (const t of topics) { const f = familyOf(t.key); if (f) m.set(f, (m.get(f) || 0) + t.share); }
  return Array.from(m.entries()).map(([family, share]) => ({ family, share: Math.round(share * 1000) / 1000 })).sort((a, b) => b.share - a.share);
}

/**
 * What a brand sells, from its own catalog: product titles/types/tags and
 * collection names (catalog words count), plus its site title and description.
 * Each product counts once (its strongest topic, a little to the next), so a
 * store with 200 coolers and 3 cases reads "mostly cooling". Weights sum to 1.
 */
export function brandTopics(input: { products: { title: string; type?: string; tags?: string[] }[]; collections?: string[]; site: string[] }): { key: string; weight: number }[] {
  const acc = new Map<string, number>();
  const add = (k: string, v: number) => acc.set(k, (acc.get(k) || 0) + v);
  for (const p of input.products.slice(0, 250)) {
    const s = scoreText([{ text: p.title, weight: 1.5 }, { text: p.type || "", weight: 1.2 }, { text: (p.tags || []).slice(0, 12).join(" · "), weight: 0.4 }], { catalog: true });
    const top = Object.entries(s).sort((a, b) => b[1] - a[1]);
    if (!top.length || top[0][1] < 1) continue;
    add(top[0][0], 1);
    if (top[1] && top[1][1] >= top[0][1] * 0.7) add(top[1][0], 0.4);
  }
  const productsSeen = Array.from(acc.values()).reduce((a, b) => a + b, 0);
  for (const c of (input.collections || []).slice(0, 60)) {
    const s = scoreText([{ text: c, weight: 1 }], { catalog: true });
    for (const [k, v] of Object.entries(s)) add(k, Math.min(1, v) * (productsSeen ? 0.6 : 2));
  }
  for (const text of input.site) {
    const s = scoreText([{ text, weight: 1 }], { catalog: true });
    for (const [k, v] of Object.entries(s)) add(k, Math.min(1, v) * (productsSeen ? 1.5 : 4));
  }
  const total = Array.from(acc.values()).reduce((a, b) => a + b, 0);
  if (!total) return [];
  // Damp the long tail: a topic must be at least 6% of what they sell.
  const raw = Array.from(acc.entries()).map(([key, v]) => ({ key, weight: v / total })).filter((t) => t.weight >= 0.06);
  const sum = raw.reduce((n, t) => n + t.weight, 0);
  return raw.map((t) => ({ key: t.key, weight: Math.round((t.weight / sum) * 1000) / 1000 })).sort((a, b) => b.weight - a.weight).slice(0, 8);
}

/**
 * How well a creator's content fits what a brand sells (0..1), and which of
 * their topics carry it. For each thing the brand sells (by weight), the best
 * a creator offers is the sum of their topic shares × affinity, capped at 1.
 */
export function topicFit(brand: { key: string; weight: number }[], creator: { key: string; share: number }[]): { fit: number; onTopic: number; carriers: { key: string; share: number }[] } {
  if (!brand.length || !creator.length) return { fit: 0, onTopic: 0, carriers: [] };
  const wsum = brand.reduce((n, b) => n + b.weight, 0) || 1;
  let fit = 0;
  const carry = new Map<string, number>();
  for (const b of brand) {
    let s = 0;
    for (const c of creator) {
      const a = affinity(c.key, b.key);
      if (a <= 0) continue;
      s += c.share * a;
      if (a >= 0.5) carry.set(c.key, c.share);
    }
    fit += (b.weight / wsum) * Math.min(1, s);
  }
  // Videos with no clear topic are unknown, not off-topic: they count at half the creator's own fit.
  const known = Math.min(1, creator.reduce((n, c) => n + c.share, 0));
  if (known < 1) fit += (1 - known) * fit * 0.5;
  const carriers = Array.from(carry.entries()).map(([key, share]) => ({ key, share })).sort((a, b) => b.share - a.share);
  // "On topic": the share of their content that is close to anything the brand sells.
  const onTopic = Math.min(1, carriers.reduce((n, c) => n + c.share, 0));
  return { fit: Math.round(fit * 1000) / 1000, onTopic: Math.round(onTopic * 1000) / 1000, carriers };
}

/** Topics two brands share — competitors when this is high. 0..1. */
export function overlap(a: { key: string; weight: number }[], b: { key: string; weight: number }[]): number {
  let s = 0;
  for (const x of a) for (const y of b) if (x.key === y.key) s += Math.min(x.weight, y.weight);
  return Math.round(s * 1000) / 1000;
}
