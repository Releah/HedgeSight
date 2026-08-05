ALTER TABLE change_records ADD COLUMN public_description text NOT NULL DEFAULT '';
ALTER TABLE change_records ADD CONSTRAINT change_public_description_length CHECK (length(public_description)<=1000);
