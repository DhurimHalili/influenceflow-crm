import openpyxl, csv, pathlib

src = pathlib.Path(r"C:\Users\Gaming pc\Desktop\workflow\influencer.xlsx")
wb = openpyxl.load_workbook(src, data_only=True)
ws = wb["Leads"]
rows = list(ws.iter_rows(min_row=2, values_only=True))
print(f"Total rows: {len(rows)}")

out_csv = pathlib.Path(r"C:\Users\Gaming pc\Desktop\workflow\influencer_creators_ready.csv")
with open(out_csv, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["name","channel_link","niche","avg_views","platform","pipeline_status","notes"])
    for r in rows:
        name, url, subs, avg, eng, days, onTopic, bio, total = r
        niche = "Desk Setups & Battlestations"
        notes = f"Subs: {int(subs):,}, Engagement: {eng}%, OnTopic: {onTopic}, BioNiche: {bio}, TotalVideos: {int(total)}, DaysSinceUpload: {int(days)}"
        w.writerow([name, url, niche, int(avg), "youtube", "new", notes])
print(f"Wrote {out_csv}")

out_txt = pathlib.Path(r"C:\Users\Gaming pc\Desktop\workflow\influencer_bulk_simple.txt")
with open(out_txt, "w", encoding="utf-8") as f:
    for r in rows:
        name, url = r[0], r[1]
        f.write(f"{name}, {url}\n")
print(f"Wrote {out_txt} with {len(rows)} lines")

# Generate SQL
sql_path = pathlib.Path(r"C:\Users\Gaming pc\Desktop\influenceflow-crm\supabase\import_influencers.sql")
user_id = "16674a1c-c22d-487b-80d7-b9c11f083f8d"
def esc(s):
    return str(s).replace("'", "''") if s else ""

with open(sql_path, "w", encoding="utf-8") as f:
    f.write("-- Import 180 influencers from workflow/influencer.xlsx\n")
    for r in rows:
        name, url, subs, avg, eng, days, onTopic, bio, total = r
        niche = "Desk Setups & Battlestations"
        notes = f"Subs: {int(subs):,}, Engagement: {eng}%, OnTopic: {onTopic}, BioNiche: {bio}, TotalVideos: {int(total)}, DaysSinceUpload: {int(days)}"
        f.write(f"insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)\n")
        f.write(f"select '{user_id}', '{esc(name)}', '{esc(url)}', '{esc(niche)}', {int(avg)}, 'youtube', 'new', '{esc(notes)}'\n")
        f.write(f"where not exists (select 1 from public.creators where user_id='{user_id}' and channel_link='{esc(url)}');\n")
print(f"Wrote SQL {sql_path}")
