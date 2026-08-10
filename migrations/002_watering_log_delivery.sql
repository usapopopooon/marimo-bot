ALTER TABLE marimo_waterings
    ADD COLUMN log_delivery_status TEXT NOT NULL DEFAULT 'delivered'
        CHECK (log_delivery_status IN ('pending', 'delivered')),
    ADD COLUMN log_delivery_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN log_last_error TEXT,
    ADD COLUMN log_delivered_at TIMESTAMPTZ;

CREATE INDEX ix_marimo_waterings_log_pending
    ON marimo_waterings (log_delivery_attempts, created_at)
    WHERE log_delivery_status = 'pending';
