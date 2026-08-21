ALTER TABLE marimo_revivals
    ADD COLUMN log_delivery_status TEXT NOT NULL DEFAULT 'delivered'
        CHECK (log_delivery_status IN ('pending', 'delivered')),
    ADD COLUMN log_delivery_attempts INTEGER NOT NULL DEFAULT 0
        CHECK (log_delivery_attempts >= 0),
    ADD COLUMN log_last_error TEXT,
    ADD COLUMN log_delivered_at TIMESTAMPTZ;

-- Completed revivals predate public revival logs and must not suddenly flood the
-- channel after deployment. Only an already prepared, not-yet-completed revival
-- should become eligible when it is completed later.
UPDATE marimo_revivals
SET log_delivery_status = 'pending'
WHERE status = 'pending';

ALTER TABLE marimo_revivals
    ALTER COLUMN log_delivery_status SET DEFAULT 'pending';

CREATE INDEX ix_marimo_revivals_log_pending
    ON marimo_revivals (log_delivery_attempts, created_at)
    WHERE status = 'completed' AND log_delivery_status = 'pending';
