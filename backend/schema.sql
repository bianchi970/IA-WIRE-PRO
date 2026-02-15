-- IA Wire Pro - Schema base (Fase B)

create table if not exists users (
  id bigserial primary key,
  email text unique,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_id on messages(conversation_id);
create index if not exists idx_conversations_user_id on conversations(user_id);
