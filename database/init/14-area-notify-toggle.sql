ALTER TABLE file_areas
    ADD COLUMN notifyEnabled TINYINT(1) NOT NULL DEFAULT 0 AFTER active;

ALTER TABLE strike_areas
    ADD COLUMN notifyEnabled TINYINT(1) NOT NULL DEFAULT 0 AFTER active;
