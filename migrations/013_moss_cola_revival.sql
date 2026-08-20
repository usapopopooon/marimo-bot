ALTER TABLE marimo_revivals
    ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'xp',
    ADD COLUMN rescuer_user_id TEXT;

UPDATE marimo_revivals
SET rescuer_user_id = user_id
WHERE rescuer_user_id IS NULL;

ALTER TABLE marimo_revivals
    ALTER COLUMN rescuer_user_id SET NOT NULL,
    ADD CONSTRAINT ck_marimo_revivals_payment_method
        CHECK (payment_method IN ('xp', 'moss-cola')),
    DROP CONSTRAINT ck_marimo_revivals_positive_cost,
    ADD CONSTRAINT ck_marimo_revivals_payment_cost CHECK (
        (payment_method = 'xp' AND cost_xp > 0)
        OR (payment_method = 'moss-cola' AND cost_xp = 0)
    );

CREATE INDEX ix_marimo_revivals_rescuer
    ON marimo_revivals (guild_id, rescuer_user_id, requested_at);
