ALTER TABLE marimo_xp_awards
    ADD COLUMN source_watering_event_id UUID REFERENCES marimo_waterings(event_id),
    ADD COLUMN award_kind TEXT NOT NULL DEFAULT 'watering';

UPDATE marimo_xp_awards
SET source_watering_event_id = event_id
WHERE source_watering_event_id IS NULL;

ALTER TABLE marimo_xp_awards
    ALTER COLUMN source_watering_event_id SET NOT NULL,
    DROP CONSTRAINT marimo_xp_awards_event_id_fkey;

CREATE UNIQUE INDEX uq_marimo_xp_awards_source_kind
    ON marimo_xp_awards (source_watering_event_id, award_kind);
