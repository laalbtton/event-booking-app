-- Add drinks_available column to venues table
ALTER TABLE venues
ADD COLUMN IF NOT EXISTS drinks_available BOOLEAN DEFAULT FALSE;
