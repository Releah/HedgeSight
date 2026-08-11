ALTER TABLE oidc_settings
  ADD COLUMN IF NOT EXISTS local_accounts_enabled boolean NOT NULL DEFAULT true;
