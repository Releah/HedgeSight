ALTER TABLE incidents ADD COLUMN IF NOT EXISTS public_message text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS public_message_updated_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS public_message_updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_public_message_length;
ALTER TABLE incidents ADD CONSTRAINT incidents_public_message_length
  CHECK (public_message IS NULL OR length(public_message) <= 2000);
