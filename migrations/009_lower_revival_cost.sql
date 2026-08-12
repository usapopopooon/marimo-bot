ALTER TABLE marimo_revivals
    DROP CONSTRAINT marimo_revivals_cost_xp_check;

ALTER TABLE marimo_revivals
    ALTER COLUMN cost_xp SET DEFAULT 1000;

ALTER TABLE marimo_revivals
    ADD CONSTRAINT ck_marimo_revivals_positive_cost CHECK (cost_xp > 0);
