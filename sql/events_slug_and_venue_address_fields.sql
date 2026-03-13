-- Add SEO slug to events and structured address fields to venues

ALTER TABLE events
ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug_unique
ON events(slug)
WHERE slug IS NOT NULL;

ALTER TABLE venues
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS country TEXT;

-- Backfill event slug using title + location + month + year.
DO $$
DECLARE
  rec RECORD;
  base_slug TEXT;
  final_slug TEXT;
BEGIN
  FOR rec IN
    SELECT id, title, COALESCE(location, '') AS location, date
    FROM events
    WHERE slug IS NULL OR slug = ''
  LOOP
    base_slug := LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          CONCAT(
            COALESCE(rec.title, 'event'),
            '-',
            SPLIT_PART(rec.location, ',', GREATEST(1, ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(rec.location, ','), 1) - 1)),
            '-',
            TO_CHAR(rec.date AT TIME ZONE 'UTC', 'Mon'),
            '-',
            TO_CHAR(rec.date AT TIME ZONE 'UTC', 'YYYY')
          ),
          '[^a-zA-Z0-9\s-]',
          '',
          'g'
        ),
        '\s+',
        '-',
        'g'
      )
    );

    base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');
    base_slug := TRIM(BOTH '-' FROM base_slug);
    IF base_slug = '' THEN
      base_slug := 'event';
    END IF;

    final_slug := base_slug;
    IF EXISTS(SELECT 1 FROM events e WHERE e.slug = final_slug AND e.id <> rec.id) THEN
      final_slug := CONCAT(base_slug, '-', SUBSTRING(rec.id::text, 1, 8));
    END IF;

    UPDATE events
    SET slug = final_slug
    WHERE id = rec.id;
  END LOOP;
END $$;
