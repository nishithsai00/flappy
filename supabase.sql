-- Run once in Supabase > SQL Editor
create table if not exists shares(
  id text primary key,
  image text, bgm text, death text,
  created_at timestamptz default now()
);
alter table shares enable row level security;  -- no policies: only your server (service key) can touch it
insert into storage.buckets (id, name, public) values ('assets','assets',true) on conflict (id) do nothing;
