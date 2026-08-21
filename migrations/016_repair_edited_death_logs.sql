ALTER TABLE marimo_revivals
    ADD COLUMN death_log_repair_status TEXT NOT NULL DEFAULT 'not-needed'
        CHECK (death_log_repair_status IN ('not-needed', 'pending', 'repaired')),
    ADD COLUMN death_log_repair_attempts INTEGER NOT NULL DEFAULT 0
        CHECK (death_log_repair_attempts >= 0),
    ADD COLUMN death_log_repair_last_error TEXT,
    ADD COLUMN death_log_repaired_at TIMESTAMPTZ;

-- Migration 015 was introduced with the release that accidentally replaced a
-- death log's text after revival. A delivery attempt proves that revival went
-- through that release's public-log path. Older completed revivals were
-- backfilled with zero attempts and must not be touched.
UPDATE marimo_revivals
SET death_log_repair_status = 'pending'
WHERE status = 'completed' AND log_delivery_attempts > 0;

CREATE INDEX ix_marimo_revivals_death_log_repair_pending
    ON marimo_revivals (death_log_repair_attempts, revived_at)
    WHERE death_log_repair_status = 'pending';
