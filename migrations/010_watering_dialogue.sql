ALTER TABLE marimo_waterings
    ADD COLUMN dialogue_id TEXT
        CHECK (dialogue_id IS NULL OR char_length(dialogue_id) BETWEEN 1 AND 64);

CREATE INDEX ix_marimo_waterings_recent_dialogue
    ON marimo_waterings (
        guild_id, user_id, watered_at DESC, created_at DESC, event_id DESC
    )
    WHERE dialogue_id IS NOT NULL;
