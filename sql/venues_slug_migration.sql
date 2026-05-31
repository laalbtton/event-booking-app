-- SEO-friendly venue profile URLs: /venues/ryans-chai

ALTER TABLE venues
ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_slug_unique
ON venues(slug)
WHERE slug IS NOT NULL;

-- Backfill slug from venue name (+ city when present for uniqueness).
DO $$
DECLARE
  rec RECORD;
  base_slug TEXT;
  final_slug TEXT;
BEGIN
  FOR rec IN
    SELECT id, name, COALESCE(city, '') AS city
    FROM venues
    WHERE slug IS NULL OR slug = ''
  LOOP
    base_slug := LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          CONCAT(
            COALESCE(rec.name, 'venue'),
            CASE WHEN rec.city <> '' THEN CONCAT('-', rec.city) ELSE '' END
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
      base_slug := 'venue';
    END IF;

    final_slug := base_slug;
    IF EXISTS(SELECT 1 FROM venues v WHERE v.slug = final_slug AND v.id <> rec.id) THEN
      final_slug := CONCAT(base_slug, '-', SUBSTRING(rec.id::text, 1, 8));
    END IF;

    UPDATE venues
    SET slug = final_slug
    WHERE id = rec.id;
  END LOOP;
END $$;
