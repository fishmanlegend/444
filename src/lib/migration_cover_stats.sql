-- Cover image pick tracking (global)
create table if not exists public.cover_image_stats (
  image_id   text        primary key,
  pick_count integer     not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.cover_image_stats enable row level security;
create policy "cover stats readable by all"   on public.cover_image_stats for select using (true);
create policy "cover stats insertable by all" on public.cover_image_stats for insert with check (true);
create policy "cover stats updatable by all"  on public.cover_image_stats for update using (true);

-- Atomic increment via RPC so the JS client doesn't need to read-modify-write
create or replace function public.increment_cover_pick(img_id text)
returns void language sql as $$
  insert into cover_image_stats (image_id, pick_count)
  values (img_id, 1)
  on conflict (image_id)
  do update set
    pick_count = cover_image_stats.pick_count + 1,
    updated_at = now();
$$;

-- Per-user pick history for personalization
create table if not exists public.user_cover_picks (
  user_id    uuid    not null,
  image_id   text    not null,
  pick_count integer not null default 0,
  primary key (user_id, image_id)
);

alter table public.user_cover_picks enable row level security;
create policy "user cover picks readable by all"   on public.user_cover_picks for select using (true);
create policy "user cover picks insertable by all" on public.user_cover_picks for insert with check (true);
create policy "user cover picks updatable by all"  on public.user_cover_picks for update using (true);

create or replace function public.increment_user_cover_pick(p_user_id uuid, img_id text)
returns void language sql as $$
  insert into user_cover_picks (user_id, image_id, pick_count)
  values (p_user_id, img_id, 1)
  on conflict (user_id, image_id)
  do update set pick_count = user_cover_picks.pick_count + 1;
$$;
