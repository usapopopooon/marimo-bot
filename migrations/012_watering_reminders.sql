CREATE TABLE marimo_watering_reminder_preferences (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_hour SMALLINT NOT NULL DEFAULT 21
        CHECK (reminder_hour IN (8, 12, 18, 21)),
    last_notified_date DATE,
    last_attempt_date DATE,
    delivery_attempts INTEGER NOT NULL DEFAULT 0
        CHECK (delivery_attempts >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX ix_marimo_watering_reminders_due
    ON marimo_watering_reminder_preferences (
        reminder_hour, last_notified_date, last_attempt_date
    )
    WHERE enabled;
