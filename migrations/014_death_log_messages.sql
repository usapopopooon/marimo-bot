ALTER TABLE marimos
    ADD COLUMN death_log_channel_id TEXT,
    ADD COLUMN death_log_message_id TEXT,
    ADD CONSTRAINT ck_marimos_death_log_message_pair CHECK (
        (death_log_channel_id IS NULL) = (death_log_message_id IS NULL)
    );
