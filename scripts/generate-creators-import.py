"""Generate ai-tech-creators.json for personal CRM import. Run once: python scripts/generate-creators-import.py"""
import json
import re
from pathlib import Path

RAW = """
Bro Code|https://www.youtube.com/@BroCodez|2.96M|150,000|2.5%|Coding & Software Engineering
Two Minute Papers|https://www.youtube.com/@TwoMinutePapers|1.81M|120,000|2.6%|AI Research Summaries
The Coding Train|https://www.youtube.com/@TheCodingTrain|1.75M|62,000|1.8%|Creative Coding & JS
Corey Schafer|https://www.youtube.com/@coreyms|1.5M|70,000|1.5%|Python & Software Dev
Sentdex|https://www.youtube.com/@sentdex|1.41M|60,000|1.4%|Machine Learning & Python
Amigoscode|https://www.youtube.com/@amigoscode|1.08M|55,000|1.2%|Backend Systems & AI Microservices
Siraj Raval|https://www.youtube.com/@sirajraval|773K|55,000|1.5%|AI & Machine Learning
Coding with Lewis|https://www.youtube.com/@CodingWithLewis|714K|65,000|1.8%|Software Engineering Lifestyle
Low Level Learning|https://www.youtube.com/@LowLevelLearning|500K|80,000|3.0%|Systems Programming & C
The Primeagen|https://www.youtube.com/@ThePrimeagen|473K|120,000|3.5%|Dev Tools & Code Architecture
Caleb Curry|https://www.youtube.com/@CalebCurry|450K|55,000|1.6%|Beginner Programming
CodingEntrepreneurs|https://www.youtube.com/@CodingEntrepreneurs|387K|54,000|1.3%|AI Product Dev & Django
Wes Roth|https://www.youtube.com/@WesRoth|319K|75,000|2.0%|AI News & Agentic Workflows
Mike Dane|https://www.youtube.com/@MikeDane|300K|60,000|1.5%|Fundamentals of Coding
Riley Brown|https://www.youtube.com/@rileybrownai|241K|52,000|1.8%|Vibe Coding & AI Agents
AI Explained|https://www.youtube.com/@AIExplained|217K|150,000|3.0%|AI News & Capabilities
Yannic Kilcher|https://www.youtube.com/@YannicKilcher|180K|50,000|2.0%|Deep Learning & ML Research
Skill Leap AI|https://www.youtube.com/@SkillLeapAI|150K|53,000|1.6%|AI Tools & Workflows
AI Foundations|https://www.youtube.com/@AIFoundations|110K|51,000|1.5%|AI Agents & Vibe Coding
Greg Kamradt|https://www.youtube.com/@GregKamradt|100K|55,000|2.0%|LLMs & AI Data Pipelines
3Blue1Brown|https://www.youtube.com/@3blue1brown|8.2M|500,000|4.0%|Math & AI Foundations
Lex Fridman|https://www.youtube.com/@lexfridman|3.1M|300,000|3.0%|AI Interviews & Tech Podcasts
Andrej Karpathy|https://www.youtube.com/@AndrejKarpathy|450K|200,000|5.0%|Deep Learning & Neural Networks
Theo - t3.gg|https://www.youtube.com/@t3dotgg|280K|70,000|2.2%|Web Dev & Tech Architecture
NetworkChuck|https://www.youtube.com/@NetworkChuck|3.2M|220,000|4.0%|IT, Networks & Cloud
StatQuest|https://www.youtube.com/@statquest|1.1M|80,000|2.5%|Machine Learning & Statistics
Kevin Powell|https://www.youtube.com/@Kepowob|850K|75,000|2.0%|Frontend CSS & HTML
Ben Eater|https://www.youtube.com/@BenEater|1.0M|150,000|3.5%|Hardware & Computing Architecture
Dave Farley|https://www.youtube.com/@ContinuousDelivery|350K|60,000|1.6%|DevOps & System Architecture
Steve Huynh|https://www.youtube.com/@ALifeEngineered|160K|70,000|2.1%|Big Tech Careers & Software
AI Advantage|https://www.youtube.com/@aiadvantage|200K|58,000|1.7%|AI Productivity & Prompting
Jack Herrington|https://www.youtube.com/@jherr|160K|52,000|1.8%|Advanced Frontend React
Dwarkesh Patel|https://www.youtube.com/@DwarkeshPatel|150K|110,000|3.5%|AI Alignment & Policy Podcasts
MKBHD|https://www.youtube.com/@mkbhd|18.5M|2,100,000|5.2%|Consumer Tech & Hardware
Dave2D|https://www.youtube.com/@Dave2D|3.6M|420,000|4.1%|Laptops & Gadget Design
Linus Tech Tips|https://www.youtube.com/@LinusTechTips|15.5M|1,200,000|3.2%|Computing Hardware & Systems
Austin Evans|https://www.youtube.com/@austinevans|5.4M|160,000|2.1%|Hardware & Gaming Tech
Mrwhosetheboss|https://www.youtube.com/@mrwhosetheboss|18.2M|3,100,000|6.0%|Mobile Tech & Gadget Reviews
JerryRigEverything|https://www.youtube.com/@JerryRigEverything|8.5M|1,100,000|4.2%|Tech Durability & Hardware
Unbox Therapy|https://www.youtube.com/@unboxtherapy|24.2M|450,000|2.5%|Consumer Tech & Gadget Unboxing
The Tech Chap|https://www.youtube.com/@TheTechChap|1.45M|125,000|2.0%|Laptops & High-End Gadgets
Daniel Bourke|https://www.youtube.com/@mrdbourke|410K|61,000|2.2%|Machine Learning Tutorials
Web Dev Simplified|https://www.youtube.com/@WebDevSimplified|1.55M|92,000|2.5%|Web Development Tutorials
DeepLearning.AI|https://www.youtube.com/@Deeplearningai|652K|100,000|5.0%|ML/DL Courses & News
Henry AI Labs|https://www.youtube.com/@henryailabs|200K|60,000|4.0%|AI Research Updates
ArXiv Insights|https://www.youtube.com/@ArxivInsights|103K|150,000|3.0%|ML Research Summaries
Clever Programmer|https://www.youtube.com/@CleverProgrammer|1.30M|200,000|6.0%|Coding & AI Tools
Net Ninja|https://www.youtube.com/@NetNinja|2.04M|120,000|3.0%|Web Development Tutorials
Sebastian Lague|https://www.youtube.com/@SebastianLague|1.40M|150,000|3.0%|Coding & Algorithms
Academind|https://www.youtube.com/@academind|3.29M|150,000|2.0%|Web/JS Frameworks & Tutorials
CodeWithChris|https://www.youtube.com/@CodeWithChris|627K|80,000|3.0%|iOS App Development
CS Dojo|https://www.youtube.com/@CSDojo|1.95M|200,000|3.0%|Python & Coding Bootcamp
Abdul Bari|https://www.youtube.com/@abdul_bari|300K|50,000|4.0%|Algorithms & Data Structures
Tech With Tim|https://www.youtube.com/@TechWithTim|667K|70,000|3.0%|Python, ML & Game Dev
Hussein Nasser|https://www.youtube.com/@hnasr|494K|60,000|5.0%|Computer Networks & Dev
Ben Awad|https://www.youtube.com/@bawad|589K|80,000|5.0%|Full-Stack Dev
Brackeys|https://www.youtube.com/@Brackeys|1.93M|150,000|4.0%|Game Development & Unity
Gary Explains|https://www.youtube.com/@GaryExplains|349K|60,000|4.0%|Tech Explainers
Engineer Man|https://www.youtube.com/@EngineerMan|527K|60,000|4.0%|Software Engineering
Krish Naik|https://www.youtube.com/@krishnaik06|1.23M|150,000|3.0%|Data Science & ML
ColdFusion|https://www.youtube.com/@ColdFusion|5.20M|200,000|4.0%|Tech Documentary & AI
CodeBullet|https://www.youtube.com/@CodeBullet|3.46M|200,000|7.0%|AI Programming Experiments
Derek Banas|https://www.youtube.com/@derekbanas|1.04M|100,000|4.0%|Programming Tutorials
TheNewBoston|https://www.youtube.com/@thenewboston|2.66M|120,000|4.0%|General Programming
Codebasics|https://www.youtube.com/@codebasics|1.49M|150,000|3.0%|Data Science & Python
Data School|https://www.youtube.com/@dataschool|256K|50,000|4.0%|Pandas & ML Tutorials
Keith Galli|https://www.youtube.com/@KeithGalli|450K|50,000|5.0%|Data Science & Python
The Cherno|https://www.youtube.com/@TheCherno|700K|50,000|4.0%|C++ Game Engine Dev
ProgrammingKnowledge|https://www.youtube.com/@ProgrammingKnowledge|1.87M|150,000|5.0%|Programming Tutorials
Programming with Mosh|https://www.youtube.com/@programmingwithmosh|2.88M|150,000|3.0%|Full-Stack & Career Dev
Neso Academy|https://www.youtube.com/@nesoacademy|3.18M|100,000|3.0%|CS & Engineering Tutorials
Python Engineer|https://www.youtube.com/@patloeber|224K|50,000|3.0%|Python ML/DS Tutorials
Coding Addict|https://www.youtube.com/@CodingAddict|200K|50,000|3.0%|Web Dev Projects
Applied AI Course|https://www.youtube.com/@AppliedAICourse|89K|50,000|2.0%|ML/AI Theory & Courses
Dad the Engineer|https://www.youtube.com/@DadtheEngineer|94K|60,000|5.0%|Electronics & STEM
Chris Hawkes|https://www.youtube.com/@noobtoprofessional|100K|50,000|5.0%|Dev Career & Advice
Coding Garden|https://www.youtube.com/@CodingGarden|200K|60,000|5.0%|Live Coding & Web Dev
Kaggle|https://www.youtube.com/@kaggle|200K|50,000|3.0%|Data Science & Competitions
Akshay Saini|https://www.youtube.com/@akshaymarch7|2.08M|120,000|3.4%|Advanced JavaScript Core Concepts
ArjanCodes|https://www.youtube.com/@ArjanCodes|327K|60,000|2.1%|Software Design & Python
ByCloud AI|https://www.youtube.com/@bycloudAI|204K|65,000|2.8%|Cloud AI & ML Deployments
ByteByteGo|https://www.youtube.com/@ByteByteGo|1.39M|110,000|3.1%|System Design & Tech Architecture
Clement Mihailescu|https://www.youtube.com/@ClementMihailescu|530K|75,000|2.6%|Software Engineering Careers & DSA
CodeWithHarry|https://www.youtube.com/@CodeWithHarry|9.67M|180,000|4.6%|Full-Stack Web Dev & Programming
Computerphile|https://www.youtube.com/@Computerphile|2.35M|120,000|3.5%|Computer Science Theory & Algorithms
Corbin Brown|https://www.youtube.com/@Corbin_Brown|130K|50,000|2.9%|Python & Machine Learning Engineering
Dani|https://www.youtube.com/@Danidev|3.57M|8,500,000|8.5%|Game Development & Physics Engines
David Bombal|https://www.youtube.com/@davidbombal|3.06M|320,000|3.1%|IT Networking & Ethical Hacking
ExplainingComputers|https://www.youtube.com/@ExplainingComputers|1.18M|180,000|8.0%|Computing Hardware & Linux OS
Gamefromscratch|https://www.youtube.com/@gamefromscratch|280K|55,000|2.1%|Game Development Tools & Engines
Gamers Nexus|https://www.youtube.com/@GamersNexus|2.61M|297,000|5.7%|PC Hardware Benchmarking
Gaurav Sen|https://www.youtube.com/@gkcs|736K|150,000|3.1%|System Design & AI
GDQuest|https://www.youtube.com/@Gdquest|317K|85,000|2.9%|Godot Engine Game Development
Greg Isenberg|https://www.youtube.com/@GregIsenberg|638K|120,000|2.2%|AI Agents & SaaS Startups
Harkirat Singh|https://www.youtube.com/@harkirat1|607K|140,000|3.2%|Full-Stack Dev & Blockchain
Hitesh Choudhary|https://www.youtube.com/@HiteshCodeLab|1.03M|73,000|2.5%|Web Frameworks & Software Dev
IppSec|https://www.youtube.com/@IppSec|308K|60,000|4.2%|Penetration Testing
Jeff Geerling|https://www.youtube.com/@JeffGeerling|1.07M|410,000|4.5%|Single-Board Computers & Hardware
Joma Tech|https://www.youtube.com/@JomaTech|2.34M|850,000|5.1%|Silicon Valley Careers & Tech
Jonas Tyroller|https://www.youtube.com/@JonasTyroller|230K|60,000|3.5%|Indie Game Dev
Jon Gjengset|https://www.youtube.com/@JonGjengset|140K|85,000|5.2%|Advanced Rust Systems Programming
Kalle Hallden|https://www.youtube.com/@Hallden_|686K|95,000|2.8%|Python Automation & Dev Vlogs
LGR|https://www.youtube.com/@LGR|1.81M|190,000|4.1%|Retro Technology & Computing
Liam Ottley|https://www.youtube.com/@LiamOttley|791K|85,000|3.2%|AI Automation Agencies & Agents
Loi Liang Yang|https://www.youtube.com/@LoiLiangYang|1.21M|80,000|4.0%|Cloud Security & AWS
Mental Outlaw|https://www.youtube.com/@MentalOutlaw|791K|152,000|3.5%|Cybersecurity, Linux & Privacy
Milan Jovanović|https://www.youtube.com/@MilanJovanovicTech|159K|54,000|2.1%|C# Software Architecture
Modern Vintage Gamer|https://www.youtube.com/@ModernVintageGamer|929K|160,000|5.7%|Console Architecture & Retrogaming
NeetCode|https://www.youtube.com/@NeetCode|1.08M|98,000|3.6%|Coding Interviews & DSA
Nick Chapsas|https://www.youtube.com/@nickchapsas|414K|57,000|2.4%|.NET & C# Software Engineering
Optimum Tech|https://www.youtube.com/@optimumtech|1.47M|1,100,000|3.1%|Custom PC Hardware & ITX Builds
PwnFunction|https://www.youtube.com/@PwnFunction|238K|180,000|4.8%|Web Application Security
Retro Game Corps|https://www.youtube.com/@RetroGameCorps|824K|140,000|3.1%|Retro Hardware Emulation
Robert Miles AI Safety|https://www.youtube.com/@RobertMilesAISafety|146K|150,000|4.1%|AI Safety & ML Alignment
Sam Witteveen AI|https://www.youtube.com/@samwitteveenai|109K|52,000|3.1%|LangChain, LLMs & Agentic AI
Seytonic|https://www.youtube.com/@Seytonic|426K|75,000|3.2%|Hardware Hacking & Raspberry Pi
Sonny Sangha|https://www.youtube.com/@SonnySangha|389K|88,000|2.2%|Full-Stack Next.js & AI Agents
take U forward|https://www.youtube.com/@takeUforward|1.04M|230,000|3.5%|Algorithms & Data Structures
TechLead|https://www.youtube.com/@TechLead|1.48M|130,000|4.1%|Silicon Valley Tech Careers
The 8-Bit Guy|https://www.youtube.com/@The8BitGuy|1.47M|280,000|4.5%|Retrocomputing & Restoration
The AI Grid|https://www.youtube.com/@TheAiGrid|374K|95,000|2.4%|AI Software & Industry Analysis
The Cyber Mentor|https://www.youtube.com/@TCMSecurityAcademy|998K|95,000|3.8%|Ethical Hacking & Blue Team
The PC Security Channel|https://www.youtube.com/@thepcsecuritychannel|500K|85,000|3.4%|Antivirus & Malware Analysis
Traversy Media|https://www.youtube.com/@TraversyMedia|2.41M|70,000|1.5%|Full-Stack Web Dev & DevOps
zSecurity|https://www.youtube.com/@zSecurity|625K|167,000|3.8%|Ethical Hacking & Wireless Security
ML Street Talk|https://www.youtube.com/@MachineLearningStreetTalk|216K|40,000|5.0%|Deep AI Discussions
Real Python|https://www.youtube.com/@realpython|80K|50,000|4.0%|Python Tutorials & Tips
"""


def parse_views(s: str) -> int | None:
    n = int(re.sub(r"[^\d]", "", s))
    return n if n > 0 else None


def norm_link(link: str) -> str:
    return link.strip().rstrip("/").lower()


creators = []
seen_links = set()
for line in RAW.strip().splitlines():
    name, link, subs, views, engagement, niche = [p.strip() for p in line.split("|")]
    key = norm_link(link)
    if key in seen_links:
        continue
    seen_links.add(key)
    creators.append({
        "name": name,
        "contactEmail": "",
        "channelLink": link,
        "niche": niche,
        "avgViews": parse_views(views),
        "notes": f"Subs: {subs} | Engagement: {engagement}",
        "status": "no_reply",
    })

out_dir = Path(__file__).resolve().parents[1] / "imports"
out_dir.mkdir(exist_ok=True)

payload = {
    "type": "influenceflow-creators-import",
    "version": 1,
    "description": "AI/Tech YouTube creators master list — import merges into YOUR browser only",
    "creators": creators,
}

(out_dir / "ai-tech-creators.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

bulk_lines = []
for c in creators:
    bulk_lines.append(f"{c['name']}, {c['channelLink']}, {c['niche']}, {c['avgViews'] or ''}")
(out_dir / "ai-tech-creators-bulk.txt").write_text("\n".join(bulk_lines), encoding="utf-8")

print(f"Wrote {len(creators)} creators to {out_dir}")
