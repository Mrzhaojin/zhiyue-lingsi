-- Auth Module (RBAC) Schema
-- Notes:
-- - This schema is fully isolated from the existing app by using dedicated tables.
-- - Required RBAC tables: users, roles, permissions, user_roles, role_permissions

-- USERS
create table if not exists users (
  id uuid primary key,
  username varchar(50) not null unique,
  email varchar(255) unique,
  phone varchar(32) unique,
  password_hash varchar(255),
  status varchar(16) not null default 'pending', -- pending|active|banned
  banned_until timestamptz,
  failed_login_count int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on users(email);
create index if not exists idx_users_phone on users(phone);
create index if not exists idx_users_status on users(status);

-- ROLES
create table if not exists roles (
  id uuid primary key,
  code varchar(64) not null unique, -- user|admin
  name varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PERMISSIONS
create table if not exists permissions (
  id uuid primary key,
  code varchar(128) not null unique, -- e.g. auth:admin:users:ban
  name varchar(255) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- USER_ROLES
create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists idx_user_roles_user on user_roles(user_id);
create index if not exists idx_user_roles_role on user_roles(role_id);

-- ROLE_PERMISSIONS
create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index if not exists idx_role_permissions_role on role_permissions(role_id);
create index if not exists idx_role_permissions_permission on role_permissions(permission_id);

-- Refresh tokens (for JWT dual-token flow)
create table if not exists auth_refresh_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash varchar(255) not null,
  jti varchar(64) not null unique,
  user_agent text,
  ip varchar(64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_refresh_tokens_user on auth_refresh_tokens(user_id);
create index if not exists idx_auth_refresh_tokens_expires on auth_refresh_tokens(expires_at);

-- Access token blacklist (logout immediately invalidates access tokens)
create table if not exists auth_token_blacklist (
  jti varchar(64) primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  reason varchar(64) not null default 'logout',
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_token_blacklist_expires on auth_token_blacklist(expires_at);

-- Email verification and password reset
create table if not exists auth_email_verifications (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  email varchar(255) not null,
  token_hash varchar(255) not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists auth_password_resets (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash varchar(255) not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Logs
create table if not exists auth_login_logs (
  id uuid primary key,
  user_id uuid references users(id) on delete set null,
  identifier varchar(255),
  ip varchar(64),
  user_agent text,
  success boolean not null,
  reason varchar(64),
  created_at timestamptz not null default now()
);

create table if not exists auth_audit_logs (
  id uuid primary key,
  actor_user_id uuid references users(id) on delete set null,
  action varchar(128) not null,
  target_user_id uuid references users(id) on delete set null,
  ip varchar(64),
  user_agent text,
  meta jsonb,
  created_at timestamptz not null default now()
);

