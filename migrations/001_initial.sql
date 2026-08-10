CREATE TABLE marimo_guild_configs (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    water_panel_channel_id TEXT,
    water_panel_message_id TEXT,
    age_panel_channel_id TEXT,
    age_panel_message_id TEXT,
    size_panel_channel_id TEXT,
    size_panel_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE marimos (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation >= 1),
    owner_display_name TEXT NOT NULL,
    name TEXT NOT NULL,
    born_at TIMESTAMPTZ NOT NULL,
    last_watered_at TIMESTAMPTZ NOT NULL,
    last_watered_date DATE NOT NULL,
    died_at TIMESTAMPTZ,
    final_size_mm NUMERIC(14, 2),
    death_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (guild_id, user_id, generation)
);

CREATE UNIQUE INDEX uq_marimos_living_owner
    ON marimos (guild_id, user_id)
    WHERE died_at IS NULL;
CREATE INDEX ix_marimos_living_guild
    ON marimos (guild_id, born_at)
    WHERE died_at IS NULL;

CREATE TABLE marimo_waterings (
    event_id UUID PRIMARY KEY,
    marimo_id BIGINT NOT NULL REFERENCES marimos(id),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    watered_date DATE NOT NULL,
    watered_at TIMESTAMPTZ NOT NULL,
    size_mm NUMERIC(14, 2) NOT NULL,
    awarded_xp INTEGER NOT NULL CHECK (awarded_xp >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (guild_id, user_id, watered_date)
);

CREATE TABLE marimo_xp_awards (
    event_id UUID PRIMARY KEY REFERENCES marimo_waterings(event_id),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    awarded_xp INTEGER NOT NULL CHECK (awarded_xp >= 0),
    observed_at TIMESTAMPTZ NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending', 'delivered')),
    delivery_attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_marimo_xp_awards_pending
    ON marimo_xp_awards (created_at)
    WHERE delivery_status = 'pending';
