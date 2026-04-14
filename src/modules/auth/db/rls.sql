-- 为 users 表启用 Row Level Security (RLS)
alter table users enable row level security;

-- 创建策略：用户只能查看自己的数据
create policy "Users can view own data" on users
  for select using (id = auth.uid());

-- 创建策略：用户只能更新自己的数据
create policy "Users can update own data" on users
  for update using (id = auth.uid());

-- 创建策略：用户只能删除自己的数据
create policy "Users can delete own data" on users
  for delete using (id = auth.uid());

-- 创建策略：只有管理员可以查看所有用户数据
create policy "Admins can view all users" on users
  for select using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );

-- 创建策略：只有管理员可以更新所有用户数据
create policy "Admins can update all users" on users
  for update using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );

-- 创建策略：只有管理员可以删除所有用户数据
create policy "Admins can delete all users" on users
  for delete using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );

-- 创建策略：允许插入新用户（用于注册）
create policy "Allow insert for new users" on users
  for insert with check (true);

-- 为其他表也启用 RLS 并设置适当的权限

-- 为 user_roles 表启用 RLS
alter table user_roles enable row level security;

-- 创建策略：用户只能查看自己的角色
create policy "Users can view own roles" on user_roles
  for select using (user_id = auth.uid());

-- 创建策略：只有管理员可以管理所有用户角色
create policy "Admins can manage all user roles" on user_roles
  for all using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );

-- 为 auth_refresh_tokens 表启用 RLS
alter table auth_refresh_tokens enable row level security;

-- 创建策略：用户只能查看自己的刷新令牌
create policy "Users can view own refresh tokens" on auth_refresh_tokens
  for select using (user_id = auth.uid());

-- 创建策略：只有管理员可以查看所有刷新令牌
create policy "Admins can view all refresh tokens" on auth_refresh_tokens
  for select using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );

-- 为 auth_token_blacklist 表启用 RLS
alter table auth_token_blacklist enable row level security;

-- 创建策略：用户只能查看自己的令牌黑名单
create policy "Users can view own token blacklist" on auth_token_blacklist
  for select using (user_id = auth.uid());

-- 创建策略：只有管理员可以查看所有令牌黑名单
create policy "Admins can view all token blacklist" on auth_token_blacklist
  for select using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );

-- 为 auth_email_verifications 表启用 RLS
alter table auth_email_verifications enable row level security;

-- 创建策略：用户只能查看自己的邮箱验证记录
create policy "Users can view own email verifications" on auth_email_verifications
  for select using (user_id = auth.uid());

-- 为 auth_password_resets 表启用 RLS
alter table auth_password_resets enable row level security;

-- 创建策略：用户只能查看自己的密码重置记录
create policy "Users can view own password resets" on auth_password_resets
  for select using (user_id = auth.uid());

-- 为 auth_login_logs 表启用 RLS
alter table auth_login_logs enable row level security;

-- 创建策略：用户只能查看自己的登录日志
create policy "Users can view own login logs" on auth_login_logs
  for select using (user_id = auth.uid());

-- 创建策略：只有管理员可以查看所有登录日志
create policy "Admins can view all login logs" on auth_login_logs
  for select using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );

-- 为 auth_audit_logs 表启用 RLS
alter table auth_audit_logs enable row level security;

-- 创建策略：只有管理员可以查看审计日志
create policy "Admins can view audit logs" on auth_audit_logs
  for select using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and r.code = 'admin'
    )
  );
