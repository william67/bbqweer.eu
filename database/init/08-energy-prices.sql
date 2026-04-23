CREATE TABLE IF NOT EXISTS energie_prices (
    priceDate   DATE        NOT NULL,
    priceHour   TINYINT     NOT NULL,
    priceKwh    DECIMAL(8,5) NULL,
    source      VARCHAR(50)  NULL,
    updatedAt   DATETIME     NULL,
    PRIMARY KEY (priceDate, priceHour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `server-tasks` (taskCode, isRunning, lastStatus)
VALUES ('energy-prices-sync', 0, 'idle');
