-- =============================================
-- ライフチェンジ手続きナビ — Supabase テーブル定義
-- =============================================

-- 匿名認証を使用するため auth.users を参照する
-- Supabase ダッシュボード > Authentication > Providers > Anonymous を有効化すること

-- =============================================
-- 1. projects（プロジェクト）
-- =============================================
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  event      text not null,
  answers    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "projects: 自分のデータを参照"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "projects: 自分のデータを追加"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "projects: 自分のデータを更新"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "projects: 自分のデータを削除"
  on public.projects for delete
  using (auth.uid() = user_id);

-- =============================================
-- 2. project_tasks（タスク）
-- =============================================
create table public.project_tasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id    text not null,
  name       text not null,
  cat        text not null,
  who        text not null,
  deps       jsonb not null default '[]',
  priority   int2 not null default 2,
  note       text,
  deadline   date,
  memo       text,
  url        text,
  unique (project_id, task_id)
);

alter table public.project_tasks enable row level security;

create policy "project_tasks: 自分のデータを参照"
  on public.project_tasks for select
  using (
    exists (
      select 1 from public.projects
      where id = project_tasks.project_id
      and user_id = auth.uid()
    )
  );

create policy "project_tasks: 自分のデータを追加"
  on public.project_tasks for insert
  with check (
    exists (
      select 1 from public.projects
      where id = project_tasks.project_id
      and user_id = auth.uid()
    )
  );

create policy "project_tasks: 自分のデータを更新"
  on public.project_tasks for update
  using (
    exists (
      select 1 from public.projects
      where id = project_tasks.project_id
      and user_id = auth.uid()
    )
  );

create policy "project_tasks: 自分のデータを削除"
  on public.project_tasks for delete
  using (
    exists (
      select 1 from public.projects
      where id = project_tasks.project_id
      and user_id = auth.uid()
    )
  );

-- =============================================
-- 3. project_done（完了済みタスク）
-- =============================================
create table public.project_done (
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id    text not null,
  done_at    timestamptz not null default now(),
  primary key (project_id, task_id)
);

alter table public.project_done enable row level security;

create policy "project_done: 自分のデータを参照"
  on public.project_done for select
  using (
    exists (
      select 1 from public.projects
      where id = project_done.project_id
      and user_id = auth.uid()
    )
  );

create policy "project_done: 自分のデータを追加"
  on public.project_done for insert
  with check (
    exists (
      select 1 from public.projects
      where id = project_done.project_id
      and user_id = auth.uid()
    )
  );

create policy "project_done: 自分のデータを更新"
  on public.project_done for update
  using (
    exists (
      select 1 from public.projects
      where id = project_done.project_id
      and user_id = auth.uid()
    )
  );

create policy "project_done: 自分のデータを削除"
  on public.project_done for delete
  using (
    exists (
      select 1 from public.projects
      where id = project_done.project_id
      and user_id = auth.uid()
    )
  );

-- =============================================
-- インデックス（検索高速化）
-- =============================================
create index on public.projects (user_id);
create index on public.project_tasks (project_id);
create index on public.project_done (project_id);
