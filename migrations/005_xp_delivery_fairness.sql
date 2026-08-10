DROP INDEX ix_marimo_xp_awards_pending;

CREATE INDEX ix_marimo_xp_awards_pending
    ON marimo_xp_awards (delivery_attempts, created_at)
    WHERE delivery_status = 'pending';
