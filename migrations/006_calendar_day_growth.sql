UPDATE marimo_waterings AS watering
SET size_mm = ROUND(
    10::numeric
    + GREATEST(
        (watering.watered_at AT TIME ZONE 'Asia/Tokyo')::date
        - (marimo.born_at AT TIME ZONE 'Asia/Tokyo')::date,
        0
      )::numeric * 0.3::numeric,
    2
)
FROM marimos AS marimo
WHERE marimo.id = watering.marimo_id;

UPDATE marimos
SET final_size_mm = ROUND(
    10::numeric
    + GREATEST(
        (died_at AT TIME ZONE 'Asia/Tokyo')::date
        - (born_at AT TIME ZONE 'Asia/Tokyo')::date,
        0
      )::numeric * 0.3::numeric,
    2
)
WHERE died_at IS NOT NULL;
