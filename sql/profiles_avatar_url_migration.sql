-- Database Migration: Profile Avatar URL
-- Adds avatar_url to profiles for storing OAuth profile pictures

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;
