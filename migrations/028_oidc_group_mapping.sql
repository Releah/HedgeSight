ALTER TABLE oidc_settings
  ADD COLUMN IF NOT EXISTS group_claim text NOT NULL DEFAULT 'groups',
  ADD COLUMN IF NOT EXISTS requested_scopes text NOT NULL DEFAULT 'openid email profile',
  ADD COLUMN IF NOT EXISTS viewer_groups text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS operator_groups text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_groups text[] NOT NULL DEFAULT '{}';
