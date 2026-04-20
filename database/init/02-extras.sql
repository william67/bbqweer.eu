USE bbqweer;

-- column_mapping: stores display config for KNMI table columns
CREATE TABLE IF NOT EXISTS `column_mapping` (
  `id` int NOT NULL AUTO_INCREMENT,
  `field` varchar(50) NOT NULL,
  `header` varchar(100) NOT NULL,
  `decimals` tinyint DEFAULT NULL,
  `sort_field` varchar(50) DEFAULT NULL,
  `format` varchar(20) DEFAULT NULL,
  `flex_width` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_field` (`field`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- users: admin accounts for bbqweer.eu
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `firstName` varchar(100) NOT NULL,
  `lastName` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- logfile: task log entries written by knmidata-v3 and other tasks
CREATE TABLE IF NOT EXISTS `logfile` (
  `datum` datetime NOT NULL,
  `logtext` varchar(255) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL,
  KEY `I_LOGFILE` (`datum`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- server-tasks: tracks background task progress (knmi sync, satellite sync, etc.)
CREATE TABLE IF NOT EXISTS `server-tasks` (
  `taskCode` varchar(50) NOT NULL,
  `isRunning` tinyint(1) NOT NULL DEFAULT '0',
  `startedAt` datetime DEFAULT NULL,
  `finishedAt` datetime DEFAULT NULL,
  `lastDurationSec` int DEFAULT NULL,
  `currentProgress` int DEFAULT NULL,
  `progressTotal` int DEFAULT NULL,
  `errorCount` int NOT NULL DEFAULT '0',
  `lastStatus` varchar(20) DEFAULT NULL,
  `lastMessage` varchar(500) DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`taskCode`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Drop tables not needed for bbqweer.eu
DROP TABLE IF EXISTS `hoofdmenus`;
DROP TABLE IF EXISTS `submenus`;
DROP TABLE IF EXISTS `queries`;
DROP TABLE IF EXISTS `solaredge_daily`;
DROP TABLE IF EXISTS `solaredge_tech`;
DROP TABLE IF EXISTS `getijden`;
DROP TABLE IF EXISTS `energie_norm_perc`;
DROP TABLE IF EXISTS `webforms`;
