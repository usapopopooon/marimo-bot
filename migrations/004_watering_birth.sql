ALTER TABLE marimo_waterings
    ADD COLUMN is_birth BOOLEAN NOT NULL DEFAULT FALSE;

WITH first_waterings AS (
    SELECT DISTINCT ON (marimo_id) event_id
    FROM marimo_waterings
    ORDER BY marimo_id, watered_at, created_at, event_id
)
UPDATE marimo_waterings AS watering
SET is_birth = TRUE
FROM first_waterings
WHERE watering.event_id = first_waterings.event_id;
