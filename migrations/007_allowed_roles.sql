CREATE TABLE marimo_allowed_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, role_id)
);
