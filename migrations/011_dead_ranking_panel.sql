ALTER TABLE marimo_guild_configs
    ADD COLUMN dead_panel_channel_id TEXT,
    ADD COLUMN dead_panel_message_id TEXT;

CREATE INDEX ix_marimos_dead_guild_size
    ON marimos (guild_id, final_size_mm DESC, died_at ASC, id ASC)
    WHERE died_at IS NOT NULL;
