-- Import 180 influencers from workflow/influencer.xlsx
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Rory Alexander', 'https://www.youtube.com/channel/UCqPNuJUqqn9QBZiq1QEW_UA', 'Desk Setups & Battlestations', 50735, 'youtube', 'new', 'Subs: 453,000, Engagement: 4.81%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCqPNuJUqqn9QBZiq1QEW_UA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'James Baldwin', 'https://www.youtube.com/channel/UC0Ene38yf-Y6movLKSvc0Iw', 'Desk Setups & Battlestations', 91252, 'youtube', 'new', 'Subs: 220,000, Engagement: 4.44%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 12'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC0Ene38yf-Y6movLKSvc0Iw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Dawid Does Tech Stuff', 'https://www.youtube.com/channel/UCvcRA2Hva1lULVf4GCouH8w', 'Desk Setups & Battlestations', 107947, 'youtube', 'new', 'Subs: 768,000, Engagement: 6.42%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCvcRA2Hva1lULVf4GCouH8w');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Dunsteer', 'https://www.youtube.com/channel/UCMwlfdqJST6YoikggEv93tA', 'Desk Setups & Battlestations', 644022, 'youtube', 'new', 'Subs: 63,900, Engagement: 3.39%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCMwlfdqJST6YoikggEv93tA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Jaden Coyer', 'https://www.youtube.com/channel/UC9YLgrlw85tnTGL6zI2eSRg', 'Desk Setups & Battlestations', 147438, 'youtube', 'new', 'Subs: 194,000, Engagement: 4.51%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 11'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC9YLgrlw85tnTGL6zI2eSRg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'SamsonGG', 'https://www.youtube.com/channel/UCUWNrLK2BSYPSpuLV4Rq7ww', 'Desk Setups & Battlestations', 60772, 'youtube', 'new', 'Subs: 266,000, Engagement: 5.99%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCUWNrLK2BSYPSpuLV4Rq7ww');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Gravel Co.', 'https://www.youtube.com/channel/UCmqAZk_r0M5nLdZpZ0cnrcA', 'Desk Setups & Battlestations', 229174, 'youtube', 'new', 'Subs: 151,000, Engagement: 4.58%, OnTopic: 1.0, BioNiche: True, TotalVideos: 12, DaysSinceUpload: 7'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCmqAZk_r0M5nLdZpZ0cnrcA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Cameron Das Racing', 'https://www.youtube.com/channel/UCTtJUFDXgnWvDWI3uPO2zWw', 'Desk Setups & Battlestations', 130023, 'youtube', 'new', 'Subs: 937,000, Engagement: 2.09%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 11'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCTtJUFDXgnWvDWI3uPO2zWw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Andres Vidoza', 'https://www.youtube.com/channel/UCC_NjLEb2Sley94py4vSYTA', 'Desk Setups & Battlestations', 60334, 'youtube', 'new', 'Subs: 622,000, Engagement: 4.13%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCC_NjLEb2Sley94py4vSYTA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'KAPPA Studio', 'https://www.youtube.com/channel/UCQigF3tZJJlt6o1_tkYKkNQ', 'Desk Setups & Battlestations', 289389, 'youtube', 'new', 'Subs: 263,000, Engagement: 3.45%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 10'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCQigF3tZJJlt6o1_tkYKkNQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Daniel Titchener', 'https://www.youtube.com/channel/UC6_8mLw-CglRDk3y8HKGnNQ', 'Desk Setups & Battlestations', 232964, 'youtube', 'new', 'Subs: 624,000, Engagement: 3.32%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 3'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC6_8mLw-CglRDk3y8HKGnNQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Edwin Olding', 'https://www.youtube.com/channel/UCm5tCR38CDoDFf33cIpsJWQ', 'Desk Setups & Battlestations', 262788, 'youtube', 'new', 'Subs: 399,000, Engagement: 2.6%, OnTopic: 0.83, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 11'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCm5tCR38CDoDFf33cIpsJWQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'SakiF4', 'https://www.youtube.com/channel/UC4DPy7YkqfRYIyGX07f96Fw', 'Desk Setups & Battlestations', 500685, 'youtube', 'new', 'Subs: 102,000, Engagement: 2.22%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC4DPy7YkqfRYIyGX07f96Fw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Jacob R', 'https://www.youtube.com/channel/UCf-z09Umbl8I21CwMpTLoyQ', 'Desk Setups & Battlestations', 84181, 'youtube', 'new', 'Subs: 715,000, Engagement: 3.3%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCf-z09Umbl8I21CwMpTLoyQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'okemudin', 'https://www.youtube.com/channel/UCIZxshIH4heO20Yj3GlgN5w', 'Desk Setups & Battlestations', 158324, 'youtube', 'new', 'Subs: 243,000, Engagement: 4.23%, OnTopic: 0.83, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCIZxshIH4heO20Yj3GlgN5w');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Minnoxide', 'https://www.youtube.com/channel/UCPEwqysLOetJ0-3mfzFOVqg', 'Desk Setups & Battlestations', 68831, 'youtube', 'new', 'Subs: 66,600, Engagement: 2.22%, OnTopic: 0.75, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCPEwqysLOetJ0-3mfzFOVqg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Jaron', 'https://www.youtube.com/channel/UCmVdvMNIjwtr9q1MC3m7kbw', 'Desk Setups & Battlestations', 87953, 'youtube', 'new', 'Subs: 302,000, Engagement: 2.19%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCmVdvMNIjwtr9q1MC3m7kbw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'maltedrivescars', 'https://www.youtube.com/channel/UC3AHsFADsZ-3B_2aYG76BLQ', 'Desk Setups & Battlestations', 90917, 'youtube', 'new', 'Subs: 282,000, Engagement: 2.31%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC3AHsFADsZ-3B_2aYG76BLQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'CNCDan', 'https://www.youtube.com/channel/UCktCGXaNOhayFRU823ScWuA', 'Desk Setups & Battlestations', 80930, 'youtube', 'new', 'Subs: 60,900, Engagement: 5.65%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCktCGXaNOhayFRU823ScWuA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'ActuallyVen', 'https://www.youtube.com/channel/UCJvHPFCABk-MPEgp4ZkNnAQ', 'Desk Setups & Battlestations', 1744279, 'youtube', 'new', 'Subs: 471,000, Engagement: 2.83%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCJvHPFCABk-MPEgp4ZkNnAQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Billy Cherokee', 'https://www.youtube.com/channel/UCTgsVHdGd6H_t5oMDKLRlPg', 'Desk Setups & Battlestations', 84430, 'youtube', 'new', 'Subs: 292,000, Engagement: 7.91%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCTgsVHdGd6H_t5oMDKLRlPg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Taylor Ray', 'https://www.youtube.com/channel/UCNqf6cy5TLNeBV5cF3yKY8A', 'Desk Setups & Battlestations', 111003, 'youtube', 'new', 'Subs: 675,000, Engagement: 4.72%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCNqf6cy5TLNeBV5cF3yKY8A');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'HokiHoshi', 'https://www.youtube.com/channel/UC8GztlirjJ3ScRqpufo3PRQ', 'Desk Setups & Battlestations', 54026, 'youtube', 'new', 'Subs: 214,000, Engagement: 4.33%, OnTopic: 0.42, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC8GztlirjJ3ScRqpufo3PRQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Nappy Boy Gaming', 'https://www.youtube.com/channel/UCi2y7o_0oQoPvnSpGtcEshw', 'Desk Setups & Battlestations', 70264, 'youtube', 'new', 'Subs: 274,000, Engagement: 3.81%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCi2y7o_0oQoPvnSpGtcEshw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Matt McMuscles', 'https://www.youtube.com/channel/UCiP_FwGyJQ_6P8k5ON5mncQ', 'Desk Setups & Battlestations', 146471, 'youtube', 'new', 'Subs: 672,000, Engagement: 5.23%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 10'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCiP_FwGyJQ_6P8k5ON5mncQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'SomecallmeJohnny', 'https://www.youtube.com/channel/UCg83RGdRpwfvoFEuE2zWKZA', 'Desk Setups & Battlestations', 84103, 'youtube', 'new', 'Subs: 417,000, Engagement: 6.75%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 19'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCg83RGdRpwfvoFEuE2zWKZA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Tiametmarduk', 'https://www.youtube.com/channel/UC7WNZQb14M9X6whT6WMsWoQ', 'Desk Setups & Battlestations', 53992, 'youtube', 'new', 'Subs: 743,000, Engagement: 3.35%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 9'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC7WNZQb14M9X6whT6WMsWoQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Adamer And Kael', 'https://www.youtube.com/channel/UCIhQQMaF7XRUaRoA_m9TBag', 'Desk Setups & Battlestations', 108830, 'youtube', 'new', 'Subs: 70,100, Engagement: 5.16%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCIhQQMaF7XRUaRoA_m9TBag');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Jarno Opmeer', 'https://www.youtube.com/channel/UCf5VvF2uO6KyFk1v_t1pnFw', 'Desk Setups & Battlestations', 50765, 'youtube', 'new', 'Subs: 516,000, Engagement: 4.66%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 3'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCf5VvF2uO6KyFk1v_t1pnFw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Harlow Luna White ', 'https://www.youtube.com/channel/UCkwXupRgX4zOyqMHKRIBOww', 'Desk Setups & Battlestations', 189814, 'youtube', 'new', 'Subs: 853,000, Engagement: 2.58%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCkwXupRgX4zOyqMHKRIBOww');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Kyle Busch', 'https://www.youtube.com/channel/UCToY9KW0aw4iVIKPykjIG1g', 'Desk Setups & Battlestations', 113151, 'youtube', 'new', 'Subs: 99,100, Engagement: 2.92%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCToY9KW0aw4iVIKPykjIG1g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Mr-Napkin', 'https://www.youtube.com/channel/UCliniROQynmFzfJFLFhosjg', 'Desk Setups & Battlestations', 207501, 'youtube', 'new', 'Subs: 764,000, Engagement: 2.01%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCliniROQynmFzfJFLFhosjg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Isle of Man TT Races', 'https://www.youtube.com/channel/UCMuZWi5NewtOTyJp4F2xl9Q', 'Desk Setups & Battlestations', 112545, 'youtube', 'new', 'Subs: 430,000, Engagement: 1.95%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 13'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCMuZWi5NewtOTyJp4F2xl9Q');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'The Journey Studio', 'https://www.youtube.com/channel/UCdm6pEE7Q6s4uU5DH3cVG6Q', 'Desk Setups & Battlestations', 265518, 'youtube', 'new', 'Subs: 260,000, Engagement: 3.24%, OnTopic: 1.0, BioNiche: False, TotalVideos: 3, DaysSinceUpload: 7'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCdm6pEE7Q6s4uU5DH3cVG6Q');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Max Afterburner', 'https://www.youtube.com/channel/UC6-y2wMNk24Fi-J2qbTTYQA', 'Desk Setups & Battlestations', 231679, 'youtube', 'new', 'Subs: 920,000, Engagement: 5.07%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC6-y2wMNk24Fi-J2qbTTYQA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Cascadia Classic', 'https://www.youtube.com/channel/UCybhRV3YwoYPiyub1WX9FRA', 'Desk Setups & Battlestations', 69162, 'youtube', 'new', 'Subs: 63,200, Engagement: 2.84%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCybhRV3YwoYPiyub1WX9FRA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'LuxPlanes', 'https://www.youtube.com/channel/UChQc-Y6wPyfA5YCPHoNa-qw', 'Desk Setups & Battlestations', 160443, 'youtube', 'new', 'Subs: 811,000, Engagement: 3.2%, OnTopic: 1.0, BioNiche: False, TotalVideos: 9, DaysSinceUpload: 9'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UChQc-Y6wPyfA5YCPHoNa-qw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Troyjannn', 'https://www.youtube.com/channel/UCZ6Y2lTEhghYDlSNbqjvHLg', 'Desk Setups & Battlestations', 64209, 'youtube', 'new', 'Subs: 298,000, Engagement: 2.22%, OnTopic: 1.0, BioNiche: False, TotalVideos: 10, DaysSinceUpload: 3'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCZ6Y2lTEhghYDlSNbqjvHLg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'More Trucker Tim', 'https://www.youtube.com/channel/UC6gVjrDu1vufjSm3eYojN7A', 'Desk Setups & Battlestations', 105778, 'youtube', 'new', 'Subs: 58,500, Engagement: 4.61%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC6gVjrDu1vufjSm3eYojN7A');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'SpectreSoundStudios', 'https://www.youtube.com/channel/UC-f76NUQN5M-Z0cd0MOP5xw', 'Desk Setups & Battlestations', 85776, 'youtube', 'new', 'Subs: 670,000, Engagement: 5.05%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC-f76NUQN5M-Z0cd0MOP5xw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'NautiStyles', 'https://www.youtube.com/channel/UCRftLfHGuTeILm7LJ8Isahw', 'Desk Setups & Battlestations', 237090, 'youtube', 'new', 'Subs: 640,000, Engagement: 4.66%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCRftLfHGuTeILm7LJ8Isahw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'techless', 'https://www.youtube.com/channel/UCLWhUMyfMHt4E92oBgWu60w', 'Desk Setups & Battlestations', 214681, 'youtube', 'new', 'Subs: 136,000, Engagement: 3.85%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 10'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCLWhUMyfMHt4E92oBgWu60w');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Tomi | Midas', 'https://www.youtube.com/channel/UCVuLYFJJoGGBO5Tnup11Jdw', 'Desk Setups & Battlestations', 69109, 'youtube', 'new', 'Subs: 581,000, Engagement: 1.78%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 17'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCVuLYFJJoGGBO5Tnup11Jdw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Dec Games', 'https://www.youtube.com/channel/UCLvGF9WOgjBbgX_FpisDAtQ', 'Desk Setups & Battlestations', 82856, 'youtube', 'new', 'Subs: 102,000, Engagement: 3.98%, OnTopic: 0.33, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 3'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCLvGF9WOgjBbgX_FpisDAtQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'iContrast', 'https://www.youtube.com/channel/UCo-CCz494BOGRIXylUZKvGA', 'Desk Setups & Battlestations', 87081, 'youtube', 'new', 'Subs: 176,000, Engagement: 3.1%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 12'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCo-CCz494BOGRIXylUZKvGA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'EbikeSchool.com', 'https://www.youtube.com/channel/UCRMrqzsrPIWvY3PINkLKs-Q', 'Desk Setups & Battlestations', 60398, 'youtube', 'new', 'Subs: 433,000, Engagement: 3.49%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 12'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCRMrqzsrPIWvY3PINkLKs-Q');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'CYCLINGABOUT', 'https://www.youtube.com/channel/UCGamtiY212YK76rDI4IhCGg', 'Desk Setups & Battlestations', 54024, 'youtube', 'new', 'Subs: 252,000, Engagement: 3.18%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCGamtiY212YK76rDI4IhCGg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Srkcycles', 'https://www.youtube.com/channel/UCPje0iVY75E7XEU2B_9Ootg', 'Desk Setups & Battlestations', 150185, 'youtube', 'new', 'Subs: 789,000, Engagement: 3.27%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCPje0iVY75E7XEU2B_9Ootg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Skylabs Audio', 'https://www.youtube.com/channel/UCfkefBAR_BBXW_2z37-ozuw', 'Desk Setups & Battlestations', 153726, 'youtube', 'new', 'Subs: 210,000, Engagement: 3.28%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCfkefBAR_BBXW_2z37-ozuw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Gearheadbryan', 'https://www.youtube.com/channel/UCNpd5mjGfrQq5L9bWnOBQ_g', 'Desk Setups & Battlestations', 56329, 'youtube', 'new', 'Subs: 278,000, Engagement: 4.58%, OnTopic: 1.0, BioNiche: False, TotalVideos: 9, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCNpd5mjGfrQq5L9bWnOBQ_g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'SEE SEE', 'https://www.youtube.com/channel/UC5OdwzKY9SPGCcggI_BJDJg', 'Desk Setups & Battlestations', 76124, 'youtube', 'new', 'Subs: 163,000, Engagement: 2.66%, OnTopic: 1.0, BioNiche: False, TotalVideos: 9, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC5OdwzKY9SPGCcggI_BJDJg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'LayerWorks', 'https://www.youtube.com/channel/UCnoAdMuWaRCFqx96hfpYgsA', 'Desk Setups & Battlestations', 149721, 'youtube', 'new', 'Subs: 457,000, Engagement: 2.22%, OnTopic: 1.0, BioNiche: False, TotalVideos: 3, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCnoAdMuWaRCFqx96hfpYgsA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Dad Advice From Bo', 'https://www.youtube.com/channel/UCity_qp1lQfwByf4joIre2g', 'Desk Setups & Battlestations', 171111, 'youtube', 'new', 'Subs: 444,000, Engagement: 3.9%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCity_qp1lQfwByf4joIre2g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Pushing Pistons', 'https://www.youtube.com/channel/UCyC9NivN2P4aVDUhSmOoYGg', 'Desk Setups & Battlestations', 183530, 'youtube', 'new', 'Subs: 618,000, Engagement: 4.05%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCyC9NivN2P4aVDUhSmOoYGg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'TalksWithNoise', 'https://www.youtube.com/channel/UCJ8BsAFkrRO7ocNnbTzajHQ', 'Desk Setups & Battlestations', 52150, 'youtube', 'new', 'Subs: 64,000, Engagement: 6.14%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 15'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCJ8BsAFkrRO7ocNnbTzajHQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'HillClimb Monsters', 'https://www.youtube.com/channel/UCCWPy8e7TkqGZH4zt4TiTNw', 'Desk Setups & Battlestations', 90871, 'youtube', 'new', 'Subs: 548,000, Engagement: 1.79%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCCWPy8e7TkqGZH4zt4TiTNw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Yamaha Racing', 'https://www.youtube.com/channel/UCD-JNBXfy-cjlmljsLrJ3nA', 'Desk Setups & Battlestations', 81189, 'youtube', 'new', 'Subs: 146,000, Engagement: 1.01%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCD-JNBXfy-cjlmljsLrJ3nA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', ' Chad Green Motorsports ', 'https://www.youtube.com/channel/UCud6pMzTe32kOYDxHTM9nrA', 'Desk Setups & Battlestations', 764499, 'youtube', 'new', 'Subs: 88,000, Engagement: 2.36%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 14'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCud6pMzTe32kOYDxHTM9nrA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'DriveVerse', 'https://www.youtube.com/channel/UC96dbs_TSGQPa0fZvJEMSNg', 'Desk Setups & Battlestations', 296844, 'youtube', 'new', 'Subs: 585,000, Engagement: 3.2%, OnTopic: 1.0, BioNiche: False, TotalVideos: 3, DaysSinceUpload: 3'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC96dbs_TSGQPa0fZvJEMSNg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Vroomatic', 'https://www.youtube.com/channel/UCISE4klDDzSVUga5_FlpnnA', 'Desk Setups & Battlestations', 160875, 'youtube', 'new', 'Subs: 356,000, Engagement: 2.14%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 14'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCISE4klDDzSVUga5_FlpnnA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Bladed Angel', 'https://www.youtube.com/channel/UCQOjhHT7NdXF1TiZE5lzxBw', 'Desk Setups & Battlestations', 635439, 'youtube', 'new', 'Subs: 967,000, Engagement: 4.84%, OnTopic: 0.75, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCQOjhHT7NdXF1TiZE5lzxBw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'TrailRecon', 'https://www.youtube.com/channel/UCEEgz9PD6iTRSB0VXNbWvRw', 'Desk Setups & Battlestations', 95789, 'youtube', 'new', 'Subs: 684,000, Engagement: 4.92%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCEEgz9PD6iTRSB0VXNbWvRw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Ronny Dahl', 'https://www.youtube.com/channel/UChz00vupzP_mNPIYD8GSmBw', 'Desk Setups & Battlestations', 61635, 'youtube', 'new', 'Subs: 598,000, Engagement: 3.12%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UChz00vupzP_mNPIYD8GSmBw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'David Walker - Epic Automotive', 'https://www.youtube.com/channel/UCHA2TakaXF6ZcND_fNivN6w', 'Desk Setups & Battlestations', 59911, 'youtube', 'new', 'Subs: 189,000, Engagement: 2.4%, OnTopic: 0.08, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCHA2TakaXF6ZcND_fNivN6w');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Chaos Causes', 'https://www.youtube.com/channel/UCiQEkLg72s8jbWL0MK5GnmA', 'Desk Setups & Battlestations', 54620, 'youtube', 'new', 'Subs: 323,000, Engagement: 4.14%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCiQEkLg72s8jbWL0MK5GnmA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Ian Hietala', 'https://www.youtube.com/channel/UC_bpH3zWmOwOg_kAjemBfoA', 'Desk Setups & Battlestations', 106783, 'youtube', 'new', 'Subs: 372,000, Engagement: 2.58%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC_bpH3zWmOwOg_kAjemBfoA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'LEODAN ', 'https://www.youtube.com/channel/UCjchRohx4O_uLncINxzqvUg', 'Desk Setups & Battlestations', 260125, 'youtube', 'new', 'Subs: 434,000, Engagement: 3.16%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCjchRohx4O_uLncINxzqvUg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Sally McNulty', 'https://www.youtube.com/channel/UCXi-p9Xh2yM4kSIQSAdZmhQ', 'Desk Setups & Battlestations', 119516, 'youtube', 'new', 'Subs: 840,000, Engagement: 2.94%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCXi-p9Xh2yM4kSIQSAdZmhQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Stotts Bicycles', 'https://www.youtube.com/channel/UCBEVFw88MBHKu0Oildp7PAA', 'Desk Setups & Battlestations', 237695, 'youtube', 'new', 'Subs: 86,400, Engagement: 2.29%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 17'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCBEVFw88MBHKu0Oildp7PAA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Formula Addict', 'https://www.youtube.com/channel/UCmbfmFGEAwnv9IkZO3ZPzPg', 'Desk Setups & Battlestations', 233499, 'youtube', 'new', 'Subs: 615,000, Engagement: 2.18%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCmbfmFGEAwnv9IkZO3ZPzPg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Cars24', 'https://www.youtube.com/channel/UCV-CPspQhwTsaiftR4JvT0w', 'Desk Setups & Battlestations', 418019, 'youtube', 'new', 'Subs: 960,000, Engagement: 5.57%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCV-CPspQhwTsaiftR4JvT0w');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'AudioPilz', 'https://www.youtube.com/channel/UCOJVsjPZcE9HxsgPKCxZfAg', 'Desk Setups & Battlestations', 50506, 'youtube', 'new', 'Subs: 176,000, Engagement: 6.88%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCOJVsjPZcE9HxsgPKCxZfAg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Pickup Music', 'https://www.youtube.com/channel/UCSeHAIacSPWhnp2MeXj14Og', 'Desk Setups & Battlestations', 87549, 'youtube', 'new', 'Subs: 254,000, Engagement: 3.15%, OnTopic: 1.0, BioNiche: False, TotalVideos: 9, DaysSinceUpload: 14'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCSeHAIacSPWhnp2MeXj14Og');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Danny Sapko', 'https://www.youtube.com/channel/UCPVjQ58A0BujzVMEmFCJ3hA', 'Desk Setups & Battlestations', 97047, 'youtube', 'new', 'Subs: 595,000, Engagement: 7.54%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCPVjQ58A0BujzVMEmFCJ3hA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Banks Power', 'https://www.youtube.com/channel/UCs50EmjtJyNLDcgTGSVNvcQ', 'Desk Setups & Battlestations', 150483, 'youtube', 'new', 'Subs: 575,000, Engagement: 1.64%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCs50EmjtJyNLDcgTGSVNvcQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Twin Engine Corsa', 'https://www.youtube.com/channel/UCnNp91s7IiPgOK6wGpa6xCA', 'Desk Setups & Battlestations', 74199, 'youtube', 'new', 'Subs: 159,000, Engagement: 4.35%, OnTopic: 1.0, BioNiche: False, TotalVideos: 9, DaysSinceUpload: 13'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCnNp91s7IiPgOK6wGpa6xCA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Freaky 3D', 'https://www.youtube.com/channel/UCbBNu7qt9Je5eeyocPUYuQw', 'Desk Setups & Battlestations', 3449392, 'youtube', 'new', 'Subs: 774,000, Engagement: 1.16%, OnTopic: 1.0, BioNiche: False, TotalVideos: 4, DaysSinceUpload: 19'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCbBNu7qt9Je5eeyocPUYuQw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'ReverseStark', 'https://www.youtube.com/channel/UCHyQYSkANFtYpz4LfS7MSjg', 'Desk Setups & Battlestations', 107394, 'youtube', 'new', 'Subs: 74,500, Engagement: 4.38%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 17'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCHyQYSkANFtYpz4LfS7MSjg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Sleeperdude', 'https://www.youtube.com/channel/UCnLGHe8eWMC0vVrRcnyhM3g', 'Desk Setups & Battlestations', 171766, 'youtube', 'new', 'Subs: 324,000, Engagement: 8.76%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCnLGHe8eWMC0vVrRcnyhM3g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Jacob Sherwood', 'https://www.youtube.com/channel/UCAKaEx3-dmaVMSXeAIp2NIQ', 'Desk Setups & Battlestations', 106370, 'youtube', 'new', 'Subs: 128,000, Engagement: 2.88%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 13'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCAKaEx3-dmaVMSXeAIp2NIQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Jimmy Oakes', 'https://www.youtube.com/channel/UChp08hcL-qAJD4LK51ZZZvw', 'Desk Setups & Battlestations', 121064, 'youtube', 'new', 'Subs: 588,000, Engagement: 7.51%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UChp08hcL-qAJD4LK51ZZZvw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Cart Narcs', 'https://www.youtube.com/channel/UClMUlr8yHymYgSe58DpUH7w', 'Desk Setups & Battlestations', 74897, 'youtube', 'new', 'Subs: 644,000, Engagement: 5.9%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 17'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UClMUlr8yHymYgSe58DpUH7w');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Chari Hawkins', 'https://www.youtube.com/channel/UC7GD5VzhPPT298cvImFrQVg', 'Desk Setups & Battlestations', 82769, 'youtube', 'new', 'Subs: 711,000, Engagement: 4.48%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC7GD5VzhPPT298cvImFrQVg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'cam shand', 'https://www.youtube.com/channel/UCMPtzN8fnhHLpihCT1QvFZw', 'Desk Setups & Battlestations', 93703, 'youtube', 'new', 'Subs: 101,000, Engagement: 3.34%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCMPtzN8fnhHLpihCT1QvFZw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Echo-SHORT', 'https://www.youtube.com/channel/UCK_t7b9S2Vx4fT8VrZO8Lsw', 'Desk Setups & Battlestations', 56973, 'youtube', 'new', 'Subs: 52,000, Engagement: 2.27%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCK_t7b9S2Vx4fT8VrZO8Lsw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'AnvelopeRo', 'https://www.youtube.com/channel/UCPru2UFfLXXqGCFHSfV8Ifw', 'Desk Setups & Battlestations', 1562524, 'youtube', 'new', 'Subs: 360,000, Engagement: 2.3%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCPru2UFfLXXqGCFHSfV8Ifw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Koenigsegg', 'https://www.youtube.com/channel/UCZJHWJZmE2B_fPwt5HMjVjQ', 'Desk Setups & Battlestations', 902977, 'youtube', 'new', 'Subs: 982,000, Engagement: 5.43%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCZJHWJZmE2B_fPwt5HMjVjQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'How To Mechatronics', 'https://www.youtube.com/channel/UCmkP178NasnhR3TWQyyP4Gw', 'Desk Setups & Battlestations', 307398, 'youtube', 'new', 'Subs: 733,000, Engagement: 1.53%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 9'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCmkP178NasnhR3TWQyyP4Gw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'DroneBot Workshop', 'https://www.youtube.com/channel/UCzml9bXoEM0itbcE96CB03w', 'Desk Setups & Battlestations', 61098, 'youtube', 'new', 'Subs: 681,000, Engagement: 4.07%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 19'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCzml9bXoEM0itbcE96CB03w');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Driver61 Sim Racing', 'https://www.youtube.com/channel/UCJp_E2Jf_NdWTWAEHWiVTNQ', 'Desk Setups & Battlestations', 111898, 'youtube', 'new', 'Subs: 83,700, Engagement: 2.7%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCJp_E2Jf_NdWTWAEHWiVTNQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'MotoWagon', 'https://www.youtube.com/channel/UC9LjrPL1bLjJ2oIU3NSdcMQ', 'Desk Setups & Battlestations', 55320, 'youtube', 'new', 'Subs: 585,000, Engagement: 2.28%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC9LjrPL1bLjJ2oIU3NSdcMQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'MoreQuan', 'https://www.youtube.com/channel/UCdIh-XrQwkqPf3XX5gSS8DA', 'Desk Setups & Battlestations', 152136, 'youtube', 'new', 'Subs: 405,000, Engagement: 3.3%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCdIh-XrQwkqPf3XX5gSS8DA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Ride Wars', 'https://www.youtube.com/channel/UCGh8Ngvs91EZFMzFygZAnsw', 'Desk Setups & Battlestations', 286230, 'youtube', 'new', 'Subs: 728,000, Engagement: 2.9%, OnTopic: 1.0, BioNiche: False, TotalVideos: 7, DaysSinceUpload: 15'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCGh8Ngvs91EZFMzFygZAnsw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Sami Haqs Cars', 'https://www.youtube.com/channel/UCe6dR0bm5HKauMk4fCR3dVw', 'Desk Setups & Battlestations', 271585, 'youtube', 'new', 'Subs: 133,000, Engagement: 2.55%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCe6dR0bm5HKauMk4fCR3dVw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Cataclysm Computers', 'https://www.youtube.com/channel/UCiJh-dVkNe7c-DmbzeGZKNQ', 'Desk Setups & Battlestations', 77763, 'youtube', 'new', 'Subs: 115,000, Engagement: 2.74%, OnTopic: 1.0, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCiJh-dVkNe7c-DmbzeGZKNQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'KitGuruTech', 'https://www.youtube.com/channel/UCy-pYDfVaRwfQ0zChOBRuuw', 'Desk Setups & Battlestations', 76300, 'youtube', 'new', 'Subs: 349,000, Engagement: 2.57%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCy-pYDfVaRwfQ0zChOBRuuw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Mr Matt Lee', 'https://www.youtube.com/channel/UCGHzpEcSwfBQJAitgw2pgVQ', 'Desk Setups & Battlestations', 57751, 'youtube', 'new', 'Subs: 297,000, Engagement: 4.59%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCGHzpEcSwfBQJAitgw2pgVQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'The Commands Man', 'https://www.youtube.com/channel/UCKMOPIcOjbNbhUgJyvHc5DQ', 'Desk Setups & Battlestations', 123497, 'youtube', 'new', 'Subs: 76,300, Engagement: 3.73%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCKMOPIcOjbNbhUgJyvHc5DQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'BuildWitt', 'https://www.youtube.com/channel/UCKqKiBDpq9j29bXbBx0cfOw', 'Desk Setups & Battlestations', 72511, 'youtube', 'new', 'Subs: 638,000, Engagement: 2.44%, OnTopic: 1.0, BioNiche: False, TotalVideos: 5, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCKqKiBDpq9j29bXbBx0cfOw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', '超猫拳/SUPER NEKOPUNCH', 'https://www.youtube.com/channel/UCtu3QGmMXAVjc6UFbTOIVGQ', 'Desk Setups & Battlestations', 94731, 'youtube', 'new', 'Subs: 275,000, Engagement: 1.37%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCtu3QGmMXAVjc6UFbTOIVGQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Энви', 'https://www.youtube.com/channel/UCFjI9asB5w9Ij8da_DvycUw', 'Desk Setups & Battlestations', 61018, 'youtube', 'new', 'Subs: 159,000, Engagement: 2.93%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 15'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCFjI9asB5w9Ij8da_DvycUw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Unsolicited advice', 'https://www.youtube.com/channel/UCW71hQg1kDxmFIfijA8dL0Q', 'Desk Setups & Battlestations', 90615, 'youtube', 'new', 'Subs: 970,000, Engagement: 4.75%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCW71hQg1kDxmFIfijA8dL0Q');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Mimho Plays', 'https://www.youtube.com/channel/UCQnT-b_NZmQY1AqtrV75vqg', 'Desk Setups & Battlestations', 66417, 'youtube', 'new', 'Subs: 784,000, Engagement: 4.14%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCQnT-b_NZmQY1AqtrV75vqg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Ward Carroll', 'https://www.youtube.com/channel/UCiUteckG37fXz0g5h8iZ_0g', 'Desk Setups & Battlestations', 68282, 'youtube', 'new', 'Subs: 689,000, Engagement: 7.45%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCiUteckG37fXz0g5h8iZ_0g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Percepcar USA 🇺🇸 ', 'https://www.youtube.com/channel/UCpmKjeQj6WCuHeBv2cVArLg', 'Desk Setups & Battlestations', 134587, 'youtube', 'new', 'Subs: 117,000, Engagement: 1.4%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCpmKjeQj6WCuHeBv2cVArLg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'TechFlow', 'https://www.youtube.com/channel/UCdU3K0pmvsuxcHFaI3aWKHw', 'Desk Setups & Battlestations', 50150, 'youtube', 'new', 'Subs: 452,000, Engagement: 2.43%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 16'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCdU3K0pmvsuxcHFaI3aWKHw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Matt''s Computer Services', 'https://www.youtube.com/channel/UCxVNTYSYaBXIqhhEURbYZLA', 'Desk Setups & Battlestations', 110416, 'youtube', 'new', 'Subs: 311,000, Engagement: 6.3%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCxVNTYSYaBXIqhhEURbYZLA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Ryan-Thomas', 'https://www.youtube.com/channel/UCNorHyg3UZYJq5jJY9ZSt-w', 'Desk Setups & Battlestations', 65082, 'youtube', 'new', 'Subs: 135,000, Engagement: 3.41%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCNorHyg3UZYJq5jJY9ZSt-w');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Greenskull', 'https://www.youtube.com/channel/UC-UXMS9Q-apozW8jALP5UZw', 'Desk Setups & Battlestations', 54160, 'youtube', 'new', 'Subs: 534,000, Engagement: 4.06%, OnTopic: 1.0, BioNiche: False, TotalVideos: 10, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC-UXMS9Q-apozW8jALP5UZw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Nate Live', 'https://www.youtube.com/channel/UCH_zBfX_o5GDZwevkh1jl9Q', 'Desk Setups & Battlestations', 198103, 'youtube', 'new', 'Subs: 468,000, Engagement: 4.58%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 20'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCH_zBfX_o5GDZwevkh1jl9Q');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Chrys Gaines', 'https://www.youtube.com/channel/UCEZXgNxNQeK3UUTMitGG38A', 'Desk Setups & Battlestations', 237302, 'youtube', 'new', 'Subs: 274,000, Engagement: 4.8%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCEZXgNxNQeK3UUTMitGG38A');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Budget-Builds Official', 'https://www.youtube.com/channel/UCsgnjvCvJZgAdSMMRG_j0cw', 'Desk Setups & Battlestations', 80606, 'youtube', 'new', 'Subs: 327,000, Engagement: 4.17%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCsgnjvCvJZgAdSMMRG_j0cw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Hermitcraft Recap - a show by fans for fans', 'https://www.youtube.com/channel/UC32w6uX5qtmUtF4QQQ2PKaQ', 'Desk Setups & Battlestations', 99133, 'youtube', 'new', 'Subs: 521,000, Engagement: 7.07%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC32w6uX5qtmUtF4QQQ2PKaQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Geometry dash Boffis', 'https://www.youtube.com/channel/UCimlrW55PWRJc8tCIE6Goog', 'Desk Setups & Battlestations', 97979, 'youtube', 'new', 'Subs: 215,000, Engagement: 2.03%, OnTopic: 1.0, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 9'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCimlrW55PWRJc8tCIE6Goog');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Jazmento', 'https://www.youtube.com/channel/UCGaZxkbPITgXBtI8sxD4REw', 'Desk Setups & Battlestations', 278518, 'youtube', 'new', 'Subs: 59,500, Engagement: 1.85%, OnTopic: 1.0, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 12'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCGaZxkbPITgXBtI8sxD4REw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Nick930', 'https://www.youtube.com/channel/UC-EWIqLzm4ttojYUAOSht9A', 'Desk Setups & Battlestations', 89480, 'youtube', 'new', 'Subs: 560,000, Engagement: 3.12%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 11'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC-EWIqLzm4ttojYUAOSht9A');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Swich Games', 'https://www.youtube.com/channel/UCdv6tAt1K7azrx9r4yKeHtw', 'Desk Setups & Battlestations', 123940, 'youtube', 'new', 'Subs: 493,000, Engagement: 4.35%, OnTopic: 0.83, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 14'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCdv6tAt1K7azrx9r4yKeHtw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'SombreroFlicks', 'https://www.youtube.com/channel/UC7xivATKKzNtVDzfMRLa2FA', 'Desk Setups & Battlestations', 128709, 'youtube', 'new', 'Subs: 71,400, Engagement: 1.39%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 7'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC7xivATKKzNtVDzfMRLa2FA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'A.M. Hoops', 'https://www.youtube.com/channel/UCtG-elouHQdUnpN9cVLdltg', 'Desk Setups & Battlestations', 186354, 'youtube', 'new', 'Subs: 658,000, Engagement: 2.99%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCtG-elouHQdUnpN9cVLdltg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'QuarterJade', 'https://www.youtube.com/channel/UC_wSuaxwUYsJOBZDWwHIQZg', 'Desk Setups & Battlestations', 52576, 'youtube', 'new', 'Subs: 767,000, Engagement: 4.88%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC_wSuaxwUYsJOBZDWwHIQZg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'The Good, The Bad & The Football', 'https://www.youtube.com/channel/UCocO2tqnEdZ7nVSFLtwJfdw', 'Desk Setups & Battlestations', 61223, 'youtube', 'new', 'Subs: 181,000, Engagement: 1.57%, OnTopic: 1.0, BioNiche: False, TotalVideos: 8, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCocO2tqnEdZ7nVSFLtwJfdw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Sourabh NEET', 'https://www.youtube.com/channel/UCf99X8msqq8EsYIgrwqouFQ', 'Desk Setups & Battlestations', 94594, 'youtube', 'new', 'Subs: 732,000, Engagement: 5.07%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCf99X8msqq8EsYIgrwqouFQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'KASI FITNESS & LIFESTYLE 🇮🇳', 'https://www.youtube.com/channel/UCaBx6lhdwMdx1ZChmzLzm4g', 'Desk Setups & Battlestations', 140547, 'youtube', 'new', 'Subs: 77,800, Engagement: 3.59%, OnTopic: 1.0, BioNiche: False, TotalVideos: 3, DaysSinceUpload: 8'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCaBx6lhdwMdx1ZChmzLzm4g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Legendary Lizzy', 'https://www.youtube.com/channel/UC6mxkJQczdMLcWkT2mvERUA', 'Desk Setups & Battlestations', 79418, 'youtube', 'new', 'Subs: 188,000, Engagement: 3.6%, OnTopic: 1.0, BioNiche: False, TotalVideos: 8, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC6mxkJQczdMLcWkT2mvERUA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'WirtualTV', 'https://www.youtube.com/channel/UCf-vV5woXPFpkvZKwooWoyw', 'Desk Setups & Battlestations', 276814, 'youtube', 'new', 'Subs: 879,000, Engagement: 3.54%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCf-vV5woXPFpkvZKwooWoyw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'MCN - Motorcyclenews.com', 'https://www.youtube.com/channel/UCB_cdRhIDhlavY2I5URSC7g', 'Desk Setups & Battlestations', 88827, 'youtube', 'new', 'Subs: 415,000, Engagement: 3.34%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCB_cdRhIDhlavY2I5URSC7g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Mach3RC', 'https://www.youtube.com/channel/UC6rl8Uaa4Mf1X9E25KTmvvQ', 'Desk Setups & Battlestations', 626888, 'youtube', 'new', 'Subs: 816,000, Engagement: 1.23%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 8'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC6rl8Uaa4Mf1X9E25KTmvvQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Ethan Harty', 'https://www.youtube.com/channel/UCBGfr2UbQS7558xlNMUq42A', 'Desk Setups & Battlestations', 92799, 'youtube', 'new', 'Subs: 174,000, Engagement: 3.64%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 8'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCBGfr2UbQS7558xlNMUq42A');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Mitchel Matthews', 'https://www.youtube.com/channel/UC0J8wQJy-QrlXkNW4evk0BA', 'Desk Setups & Battlestations', 187517, 'youtube', 'new', 'Subs: 388,000, Engagement: 1.11%, OnTopic: 1.0, BioNiche: False, TotalVideos: 4, DaysSinceUpload: 19'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC0J8wQJy-QrlXkNW4evk0BA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Rahim Hemani', 'https://www.youtube.com/channel/UC7Dm1o7RUu266GKznhr1pIg', 'Desk Setups & Battlestations', 56426, 'youtube', 'new', 'Subs: 352,000, Engagement: 5.24%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC7Dm1o7RUu266GKznhr1pIg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'The Chandler', 'https://www.youtube.com/channel/UCc6X0hdss1Ufh73V_A5obYQ', 'Desk Setups & Battlestations', 323337, 'youtube', 'new', 'Subs: 335,000, Engagement: 3.21%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 10'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCc6X0hdss1Ufh73V_A5obYQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Misfit ', 'https://www.youtube.com/channel/UCIai02MkUgYwSYDEJ7L933g', 'Desk Setups & Battlestations', 88969, 'youtube', 'new', 'Subs: 101,000, Engagement: 3.28%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 18'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCIai02MkUgYwSYDEJ7L933g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Webby87', 'https://www.youtube.com/channel/UCXoH2d_sWHnLP4bJq9UMtnA', 'Desk Setups & Battlestations', 81193, 'youtube', 'new', 'Subs: 150,000, Engagement: 3.83%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 8'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCXoH2d_sWHnLP4bJq9UMtnA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'gamewise', 'https://www.youtube.com/channel/UCnbRKDqX3rnIcKEUnrjJyVw', 'Desk Setups & Battlestations', 90685, 'youtube', 'new', 'Subs: 106,000, Engagement: 1.42%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 7'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCnbRKDqX3rnIcKEUnrjJyVw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Nikias Molina', 'https://www.youtube.com/channel/UC_TdF-rtQ8N53wHNbknPxkA', 'Desk Setups & Battlestations', 60519, 'youtube', 'new', 'Subs: 419,000, Engagement: 2.51%, OnTopic: 1.0, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 12'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC_TdF-rtQ8N53wHNbknPxkA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'engineericly', 'https://www.youtube.com/channel/UCYpSqQvrlGw4UTVFfMpGzjw', 'Desk Setups & Battlestations', 197776, 'youtube', 'new', 'Subs: 768,000, Engagement: 1.78%, OnTopic: 1.0, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 11'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCYpSqQvrlGw4UTVFfMpGzjw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Lexie Limitless', 'https://www.youtube.com/channel/UCWoEpiHaC7LOQhaHFT8Rx7A', 'Desk Setups & Battlestations', 156371, 'youtube', 'new', 'Subs: 750,000, Engagement: 2.91%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 19'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCWoEpiHaC7LOQhaHFT8Rx7A');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'FoltynPlays Top Videos', 'https://www.youtube.com/channel/UCwi6mVMUumqficaA2bM9gFg', 'Desk Setups & Battlestations', 176755, 'youtube', 'new', 'Subs: 592,000, Engagement: 1.2%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCwi6mVMUumqficaA2bM9gFg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Wittyyb', 'https://www.youtube.com/channel/UCapdaZu980orxjwpn0q-lrg', 'Desk Setups & Battlestations', 260004, 'youtube', 'new', 'Subs: 822,000, Engagement: 2.12%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCapdaZu980orxjwpn0q-lrg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Madison Clysdale', 'https://www.youtube.com/channel/UCqpNHx_gjAV70G-H1jZMpOg', 'Desk Setups & Battlestations', 348128, 'youtube', 'new', 'Subs: 865,000, Engagement: 3.26%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCqpNHx_gjAV70G-H1jZMpOg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'RobloxGamerz', 'https://www.youtube.com/channel/UCpJwXBy78SdhJGrbsC9Z6pA', 'Desk Setups & Battlestations', 1237864, 'youtube', 'new', 'Subs: 300,000, Engagement: 2.34%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 14'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCpJwXBy78SdhJGrbsC9Z6pA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'SocialOrbit', 'https://www.youtube.com/channel/UCW-tKoWEHPo1KMkd82OlSfQ', 'Desk Setups & Battlestations', 65765, 'youtube', 'new', 'Subs: 273,000, Engagement: 6.78%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCW-tKoWEHPo1KMkd82OlSfQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'MoonMayan', 'https://www.youtube.com/channel/UC4eU_j-leK5_O068bmnZvXQ', 'Desk Setups & Battlestations', 51317, 'youtube', 'new', 'Subs: 282,000, Engagement: 3.14%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC4eU_j-leK5_O068bmnZvXQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'CycleDrag', 'https://www.youtube.com/channel/UCNigxdsLkPqwj-QoYPi6MNg', 'Desk Setups & Battlestations', 133034, 'youtube', 'new', 'Subs: 732,000, Engagement: 2.82%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCNigxdsLkPqwj-QoYPi6MNg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'StormyXV', 'https://www.youtube.com/channel/UCFDQ7eLb1l2NOJpfZVFxcDw', 'Desk Setups & Battlestations', 65318, 'youtube', 'new', 'Subs: 680,000, Engagement: 3.02%, OnTopic: 1.0, BioNiche: False, TotalVideos: 3, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCFDQ7eLb1l2NOJpfZVFxcDw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Bandita Drive', 'https://www.youtube.com/channel/UCR1Pl0WXom6d6e6b_eNpMAQ', 'Desk Setups & Battlestations', 99975, 'youtube', 'new', 'Subs: 276,000, Engagement: 4.35%, OnTopic: 1.0, BioNiche: False, TotalVideos: 10, DaysSinceUpload: 8'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCR1Pl0WXom6d6e6b_eNpMAQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Saurav Haldar', 'https://www.youtube.com/channel/UCdR4ZgXoiRxakI8rmI9Ux0Q', 'Desk Setups & Battlestations', 833497, 'youtube', 'new', 'Subs: 693,000, Engagement: 2.71%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 5'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCdR4ZgXoiRxakI8rmI9Ux0Q');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'More Goosiest', 'https://www.youtube.com/channel/UCBRO2vZGFwBXkldSN2U5DRg', 'Desk Setups & Battlestations', 74076, 'youtube', 'new', 'Subs: 214,000, Engagement: 4.31%, OnTopic: 0.75, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 10'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCBRO2vZGFwBXkldSN2U5DRg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Silly inventor', 'https://www.youtube.com/channel/UCEAsQjzr3CUxi_TmWnEtZkA', 'Desk Setups & Battlestations', 338521, 'youtube', 'new', 'Subs: 371,000, Engagement: 1.24%, OnTopic: 1.0, BioNiche: False, TotalVideos: 9, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCEAsQjzr3CUxi_TmWnEtZkA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Gazzaladra', 'https://www.youtube.com/channel/UCJfjzTF1gs5cKQsrOyUtLtA', 'Desk Setups & Battlestations', 2894072, 'youtube', 'new', 'Subs: 275,000, Engagement: 3.84%, OnTopic: 1.0, BioNiche: False, TotalVideos: 5, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCJfjzTF1gs5cKQsrOyUtLtA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Tyriel Wood - VR Tech', 'https://www.youtube.com/channel/UC5rMneyhrBKrNuzJQkRy0uw', 'Desk Setups & Battlestations', 50564, 'youtube', 'new', 'Subs: 139,000, Engagement: 2.48%, OnTopic: 0.92, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC5rMneyhrBKrNuzJQkRy0uw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Autogefühl', 'https://www.youtube.com/channel/UCG0__4AhnoCWRH7TPO0PQyg', 'Desk Setups & Battlestations', 62974, 'youtube', 'new', 'Subs: 991,000, Engagement: 2.63%, OnTopic: 1.0, BioNiche: False, TotalVideos: 9, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCG0__4AhnoCWRH7TPO0PQyg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Freakin'' Reviews', 'https://www.youtube.com/channel/UCTCpOFIu6dHgOjNJ0rTymkQ', 'Desk Setups & Battlestations', 74668, 'youtube', 'new', 'Subs: 875,000, Engagement: 4.69%, OnTopic: 1.0, BioNiche: False, TotalVideos: 10, DaysSinceUpload: 3'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCTCpOFIu6dHgOjNJ0rTymkQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Sheikh Waseem', 'https://www.youtube.com/channel/UC_YkjNmg8VSCH4s5GNkS3Xg', 'Desk Setups & Battlestations', 114272, 'youtube', 'new', 'Subs: 902,000, Engagement: 4.5%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC_YkjNmg8VSCH4s5GNkS3Xg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'dose2rallye', 'https://www.youtube.com/channel/UCBf9ZfkIVY9Cd5zKiKJ6SIA', 'Desk Setups & Battlestations', 97289, 'youtube', 'new', 'Subs: 129,000, Engagement: 2.55%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCBf9ZfkIVY9Cd5zKiKJ6SIA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'All In One Ideas', 'https://www.youtube.com/channel/UCQrVlQOkcNxRA1Urjj9g50g', 'Desk Setups & Battlestations', 80315, 'youtube', 'new', 'Subs: 356,000, Engagement: 2.13%, OnTopic: 0.75, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCQrVlQOkcNxRA1Urjj9g50g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Bricks n Cars', 'https://www.youtube.com/channel/UCHNJtJySCyf6VKbJL_K8QzA', 'Desk Setups & Battlestations', 108598, 'youtube', 'new', 'Subs: 329,000, Engagement: 1.27%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCHNJtJySCyf6VKbJL_K8QzA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Arjun Thomas', 'https://www.youtube.com/channel/UCGsWwaxiVIysl3wLlXCozkg', 'Desk Setups & Battlestations', 138349, 'youtube', 'new', 'Subs: 360,000, Engagement: 1.55%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCGsWwaxiVIysl3wLlXCozkg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Faad Technician', 'https://www.youtube.com/channel/UCwzkIBttlFZYgN0q66KFTPw', 'Desk Setups & Battlestations', 246325, 'youtube', 'new', 'Subs: 964,000, Engagement: 4.29%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCwzkIBttlFZYgN0q66KFTPw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'SAM TODD', 'https://www.youtube.com/channel/UClVrwBHuA2Lnefo3DcbI6Qw', 'Desk Setups & Battlestations', 106272, 'youtube', 'new', 'Subs: 192,000, Engagement: 5.88%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UClVrwBHuA2Lnefo3DcbI6Qw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'MobiiCare', 'https://www.youtube.com/channel/UCGOOZ7BJfWPi8BBcsOXwPng', 'Desk Setups & Battlestations', 123604, 'youtube', 'new', 'Subs: 412,000, Engagement: 3.1%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCGOOZ7BJfWPi8BBcsOXwPng');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Jabezrtp', 'https://www.youtube.com/channel/UC3nPSqsmjmijeQPrqgGrTCw', 'Desk Setups & Battlestations', 304151, 'youtube', 'new', 'Subs: 277,000, Engagement: 4.25%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC3nPSqsmjmijeQPrqgGrTCw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Keeping It Casual', 'https://www.youtube.com/channel/UCHpBQ2j3V4THy2EXmtIBUzQ', 'Desk Setups & Battlestations', 111798, 'youtube', 'new', 'Subs: 75,900, Engagement: 4.67%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCHpBQ2j3V4THy2EXmtIBUzQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Spencer Lackey', 'https://www.youtube.com/channel/UCImisRlZTVQ0vblWjjYih4Q', 'Desk Setups & Battlestations', 115060, 'youtube', 'new', 'Subs: 659,000, Engagement: 2.25%, OnTopic: 1.0, BioNiche: False, TotalVideos: 6, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCImisRlZTVQ0vblWjjYih4Q');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'GCN Tech', 'https://www.youtube.com/channel/UC710HJmp-YgNbE5BnFBRoeg', 'Desk Setups & Battlestations', 75030, 'youtube', 'new', 'Subs: 864,000, Engagement: 2.8%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC710HJmp-YgNbE5BnFBRoeg');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'EP Diecast Racing', 'https://www.youtube.com/channel/UC0Xfsd9qD4Ya93MyXvJiYFA', 'Desk Setups & Battlestations', 495130, 'youtube', 'new', 'Subs: 104,000, Engagement: 1.2%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC0Xfsd9qD4Ya93MyXvJiYFA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Rakesh Bansal', 'https://www.youtube.com/channel/UC6HlGuJZ0_M_rSgm0hoRhDQ', 'Desk Setups & Battlestations', 53609, 'youtube', 'new', 'Subs: 507,000, Engagement: 3.19%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC6HlGuJZ0_M_rSgm0hoRhDQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Guiny', 'https://www.youtube.com/channel/UCH9uXy46sHi5ltU0bQp5asQ', 'Desk Setups & Battlestations', 350443, 'youtube', 'new', 'Subs: 740,000, Engagement: 3.13%, OnTopic: 0.91, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 9'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCH9uXy46sHi5ltU0bQp5asQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Auto Gear India', 'https://www.youtube.com/channel/UC0f6_waCsBHOj70hzqMtXRQ', 'Desk Setups & Battlestations', 129871, 'youtube', 'new', 'Subs: 423,000, Engagement: 3.42%, OnTopic: 1.0, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 6'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC0f6_waCsBHOj70hzqMtXRQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Techmagnet', 'https://www.youtube.com/channel/UCOAOhRVS-XpQVMeFKxB2xhQ', 'Desk Setups & Battlestations', 103752, 'youtube', 'new', 'Subs: 457,000, Engagement: 1.72%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCOAOhRVS-XpQVMeFKxB2xhQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'DBHype', 'https://www.youtube.com/channel/UCYyDvLKr2JWgyD7tXPnzBHA', 'Desk Setups & Battlestations', 58775, 'youtube', 'new', 'Subs: 718,000, Engagement: 4.13%, OnTopic: 1.0, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCYyDvLKr2JWgyD7tXPnzBHA');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Justin''s Den', 'https://www.youtube.com/channel/UCzkrQu_NI-H9hHLiHNFaqkQ', 'Desk Setups & Battlestations', 133382, 'youtube', 'new', 'Subs: 332,000, Engagement: 5.27%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCzkrQu_NI-H9hHLiHNFaqkQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Natalia Vieru', 'https://www.youtube.com/channel/UC1Os06sjwD388tJEFINLwGw', 'Desk Setups & Battlestations', 92488, 'youtube', 'new', 'Subs: 137,000, Engagement: 1.78%, OnTopic: 1.0, BioNiche: False, TotalVideos: 3, DaysSinceUpload: 16'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC1Os06sjwD388tJEFINLwGw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Sunderdeep Singh', 'https://www.youtube.com/channel/UCZ5eEAKKrCYIGN6PHnwuw4g', 'Desk Setups & Battlestations', 52224, 'youtube', 'new', 'Subs: 186,000, Engagement: 3.17%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCZ5eEAKKrCYIGN6PHnwuw4g');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Anjali Dhingra', 'https://www.youtube.com/channel/UC92EFrsOrH7oCyTjV5gG4bw', 'Desk Setups & Battlestations', 74128, 'youtube', 'new', 'Subs: 784,000, Engagement: 3.91%, OnTopic: 1.0, BioNiche: False, TotalVideos: 11, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC92EFrsOrH7oCyTjV5gG4bw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Houme Interior Design', 'https://www.youtube.com/channel/UCnvsRKSyfxNLUYHZp3Fhk2Q', 'Desk Setups & Battlestations', 77151, 'youtube', 'new', 'Subs: 642,000, Engagement: 2.99%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 2'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCnvsRKSyfxNLUYHZp3Fhk2Q');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Edmunds Cars', 'https://www.youtube.com/channel/UCF8e8zKZ_yk7cL9DvvWGSEw', 'Desk Setups & Battlestations', 78847, 'youtube', 'new', 'Subs: 634,000, Engagement: 1.33%, OnTopic: 1.0, BioNiche: False, TotalVideos: 6, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCF8e8zKZ_yk7cL9DvvWGSEw');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Fuel Injected', 'https://www.youtube.com/channel/UCxCNGZW9KcBOzLpYPCE_ouQ', 'Desk Setups & Battlestations', 58820, 'youtube', 'new', 'Subs: 1,000,000, Engagement: 2.78%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 0'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCxCNGZW9KcBOzLpYPCE_ouQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Logbook', 'https://www.youtube.com/channel/UC4PNGOz9FNCAZhE6I6nRKOQ', 'Desk Setups & Battlestations', 56680, 'youtube', 'new', 'Subs: 286,000, Engagement: 3.27%, OnTopic: 1.0, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 4'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UC4PNGOz9FNCAZhE6I6nRKOQ');
insert into public.creators (user_id, name, channel_link, niche, avg_views, platform, pipeline_status, notes)
select '16674a1c-c22d-487b-80d7-b9c11f083f8d', 'Flightradar24', 'https://www.youtube.com/channel/UCcGI_kXwKl_QhyW9jK_8gIA', 'Desk Setups & Battlestations', 56232, 'youtube', 'new', 'Subs: 435,000, Engagement: 3.16%, OnTopic: 0.83, BioNiche: False, TotalVideos: 12, DaysSinceUpload: 1'
where not exists (select 1 from public.creators where user_id='16674a1c-c22d-487b-80d7-b9c11f083f8d' and channel_link='https://www.youtube.com/channel/UCcGI_kXwKl_QhyW9jK_8gIA');
