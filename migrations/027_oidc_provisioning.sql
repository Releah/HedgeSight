ALTER TABLE oidc_settings
  ADD COLUMN IF NOT EXISTS automatic_provisioning boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_role text NOT NULL DEFAULT 'viewer'
    CHECK (default_role IN ('viewer', 'operator', 'admin'));
