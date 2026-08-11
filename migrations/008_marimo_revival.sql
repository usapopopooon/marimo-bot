CREATE TABLE marimo_revivals (
    event_id UUID PRIMARY KEY,
    marimo_id BIGINT NOT NULL REFERENCES marimos(id),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    cost_xp INTEGER NOT NULL DEFAULT 3000 CHECK (cost_xp = 3000),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed')),
    generation INTEGER NOT NULL,
    owner_display_name TEXT NOT NULL,
    name TEXT NOT NULL,
    born_at TIMESTAMPTZ NOT NULL,
    last_watered_at TIMESTAMPTZ NOT NULL,
    last_watered_date DATE NOT NULL,
    died_at TIMESTAMPTZ NOT NULL,
    final_size_mm NUMERIC(14, 2) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    revived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_marimo_revivals_pending_marimo
    ON marimo_revivals (marimo_id)
    WHERE status = 'pending';

CREATE INDEX ix_marimo_revivals_owner
    ON marimo_revivals (guild_id, user_id, requested_at);
