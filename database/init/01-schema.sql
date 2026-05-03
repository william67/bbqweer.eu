CREATE DATABASE IF NOT EXISTS bbqweer CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE bbqweer;
-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: localhost    Database: knmi
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `sort_order` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categories_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dagnormen`
--

DROP TABLE IF EXISTS `dagnormen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dagnormen` (
  `STATION` smallint DEFAULT NULL,
  `DECENNIUM` smallint NOT NULL,
  `MAAND` tinyint DEFAULT NULL,
  `DAG` tinyint DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_DAGNORMEN` (`STATION`,`DECENNIUM`,`MAAND`,`DAG`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dagnormen_raw`
--

DROP TABLE IF EXISTS `dagnormen_raw`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dagnormen_raw` (
  `STATION` smallint DEFAULT NULL,
  `DECENNIUM` smallint NOT NULL,
  `MAAND` tinyint DEFAULT NULL,
  `DAG` tinyint DEFAULT NULL,
  `DOY` smallint DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_DAGNORMEN_RAW` (`STATION`,`DECENNIUM`,`DOY`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `datafiles`
--

DROP TABLE IF EXISTS `datafiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `datafiles` (
  `NUMMER` int NOT NULL AUTO_INCREMENT,
  `FILENAME` varchar(60) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DATE_LAST_IMPORT` datetime DEFAULT NULL,
  `RECORDS` int DEFAULT NULL,
  `FILEDATE` datetime DEFAULT NULL,
  `DATE_LAST_CHECK` datetime DEFAULT NULL,
  `INTERNET_LINK` varchar(120) DEFAULT NULL,
  `STATION` smallint DEFAULT NULL,
  `NEERSLAGSTATION` smallint DEFAULT NULL,
  `FILETYPE` varchar(2) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `ZIPFILE` varchar(60) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `LINECOUNT` int DEFAULT NULL,
  `NEW_FILEDATE` datetime DEFAULT NULL,
  PRIMARY KEY (`NUMMER`)
) ENGINE=InnoDB AUTO_INCREMENT=1545 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `datasets`
--

DROP TABLE IF EXISTS `datasets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `datasets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `category_id` int DEFAULT NULL,
  `name` varchar(50) NOT NULL,
  `category` varchar(255) DEFAULT NULL,
  `chartYn` tinyint(1) NOT NULL DEFAULT '0',
  `anychart_config` longtext,
  `chartjs_config` longtext,
  `sort_order` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `fk_datasets_category` (`category_id`),
  CONSTRAINT `fk_datasets_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--
-- Table structure for table `decadegegevens`
--

DROP TABLE IF EXISTS `decadegegevens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `decadegegevens` (
  `STATION` smallint DEFAULT NULL,
  `JAAR` smallint DEFAULT NULL,
  `MAAND` tinyint DEFAULT NULL,
  `DECADE` tinyint DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TN_AVG` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `TX_AVG` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_DECADEGEGEVENS` (`STATION`,`JAAR`,`MAAND`,`DECADE`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `decadenormen`
--

DROP TABLE IF EXISTS `decadenormen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `decadenormen` (
  `STATION` smallint DEFAULT NULL,
  `DECENNIUM` smallint NOT NULL,
  `MAAND` tinyint DEFAULT NULL,
  `DECADE` tinyint DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_DECADENORM2000` (`STATION`,`DECENNIUM`,`MAAND`,`DECADE`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--

--
-- Table structure for table `etmgeg`
--

DROP TABLE IF EXISTS `etmgeg`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `etmgeg` (
  `STATION` smallint NOT NULL,
  `JAAR` smallint NOT NULL,
  `MAAND` tinyint NOT NULL,
  `DAG` tinyint NOT NULL,
  `DATUM` date NOT NULL,
  `DDVEC` decimal(12,2) DEFAULT NULL,
  `FG` decimal(12,2) DEFAULT NULL,
  `FHX` decimal(12,2) DEFAULT NULL,
  `FXX` decimal(12,2) DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `SP` decimal(12,2) DEFAULT NULL,
  `DR` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `VVN` decimal(12,2) DEFAULT NULL,
  `NG` decimal(12,2) DEFAULT NULL,
  `UG` decimal(12,2) DEFAULT NULL,
  `FHN` decimal(12,2) DEFAULT NULL,
  `T10N` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  `PX` decimal(12,2) DEFAULT NULL,
  `PN` decimal(12,2) DEFAULT NULL,
  `VVX` decimal(12,2) DEFAULT NULL,
  `UX` decimal(12,2) DEFAULT NULL,
  `UN` decimal(12,2) DEFAULT NULL,
  `EV24` decimal(12,2) DEFAULT NULL,
  `WEEK` tinyint NOT NULL,
  `JAAR_WEEK` smallint NOT NULL,
  `SEIZOEN` varchar(2) NOT NULL,
  `JAAR_SEIZOEN` smallint NOT NULL,
  `WINTER` smallint NOT NULL,
  `FHVEC` decimal(12,2) DEFAULT NULL,
  `FHXH` tinyint DEFAULT NULL,
  `FHNH` tinyint DEFAULT NULL,
  `FXXH` tinyint DEFAULT NULL,
  `TNH` tinyint DEFAULT NULL,
  `TXH` tinyint DEFAULT NULL,
  `T10NH` tinyint DEFAULT NULL,
  `RHX` decimal(12,2) DEFAULT NULL,
  `RHXH` tinyint DEFAULT NULL,
  `PXH` tinyint DEFAULT NULL,
  `PNH` tinyint DEFAULT NULL,
  `VVNH` tinyint DEFAULT NULL,
  `VVXH` tinyint DEFAULT NULL,
  `UXH` tinyint DEFAULT NULL,
  `UNH` tinyint DEFAULT NULL,
  `DECADE` tinyint NOT NULL,
  `DECENNIUM` smallint NOT NULL,
  `SYNC_KEY` varchar(11) GENERATED ALWAYS AS (concat(lpad(`STATION`,3,_latin1'0'),lpad(`JAAR`,4,_latin1'0'),lpad(`MAAND`,2,_latin1'0'),lpad(`DAG`,2,_latin1'0'))) STORED,
  UNIQUE KEY `I_ETMGEG` (`STATION`,`JAAR`,`MAAND`,`DAG`),
  KEY `I_ETMGEG_SEIZOEN` (`STATION`,`JAAR_SEIZOEN`,`SEIZOEN`),
  KEY `I_ETMGEG_WEEK` (`STATION`,`JAAR_WEEK`,`WEEK`),
  KEY `I_ETMGEG_DATUM` (`STATION`,`DATUM`),
  KEY `idx_etmgeg_sync_key` (`SYNC_KEY`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--

--
-- Table structure for table `hittegolven`
--

DROP TABLE IF EXISTS `hittegolven`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hittegolven` (
  `station` smallint NOT NULL,
  `volgnr` int NOT NULL,
  `begin` date NOT NULL,
  `einde` date NOT NULL,
  `dagen` int NOT NULL,
  `tropisch` int NOT NULL,
  `tmax` decimal(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_german1_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--
-- Table structure for table `jaargegevens`
--

DROP TABLE IF EXISTS `jaargegevens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jaargegevens` (
  `STATION` smallint DEFAULT NULL,
  `JAAR` smallint DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TN_AVG` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `TX_AVG` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_JAARGEGEVENS` (`STATION`,`JAAR`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `jaarnormen`
--

DROP TABLE IF EXISTS `jaarnormen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jaarnormen` (
  `STATION` smallint DEFAULT NULL,
  `DECENNIUM` smallint NOT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_JAARNORM2000` (`STATION`,`DECENNIUM`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `koudegolven`
--

DROP TABLE IF EXISTS `koudegolven`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `koudegolven` (
  `station` smallint NOT NULL,
  `volgnr` int NOT NULL,
  `begin` date NOT NULL,
  `einde` date NOT NULL,
  `dagen` int NOT NULL,
  `streng` int NOT NULL,
  `tmin` decimal(12,2) NOT NULL,
  `hellmann` decimal(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_german1_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `logfile`
--

DROP TABLE IF EXISTS `logfile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `logfile` (
  `datum` datetime NOT NULL,
  `logtext` varchar(255) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL,
  KEY `I_LOGFILE` (`datum`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `maandgegevens`
--

DROP TABLE IF EXISTS `maandgegevens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maandgegevens` (
  `STATION` smallint DEFAULT NULL,
  `JAAR` smallint DEFAULT NULL,
  `MAAND` tinyint DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TN_AVG` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `TX_AVG` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_MAANDGEGEVENS` (`STATION`,`JAAR`,`MAAND`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `maandnormen`
--

DROP TABLE IF EXISTS `maandnormen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maandnormen` (
  `STATION` smallint DEFAULT NULL,
  `DECENNIUM` smallint NOT NULL,
  `MAAND` tinyint DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_MAANDNORM2000` (`STATION`,`MAAND`,`DECENNIUM`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `neerslaggeg`
--

DROP TABLE IF EXISTS `neerslaggeg`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `neerslaggeg` (
  `STATION` smallint NOT NULL,
  `JAAR` smallint NOT NULL,
  `MAAND` tinyint NOT NULL,
  `DAG` tinyint NOT NULL,
  `DATUM` date NOT NULL,
  `RD` decimal(12,2) DEFAULT NULL,
  `SX` decimal(12,2) DEFAULT NULL,
  `WEEK` tinyint NOT NULL,
  `JAAR_WEEK` smallint NOT NULL,
  `SEIZOEN` varchar(2) NOT NULL,
  `JAAR_SEIZOEN` smallint NOT NULL,
  `DECADE` tinyint NOT NULL,
  `WINTER` smallint NOT NULL,
  `SYNC_KEY` varchar(11) GENERATED ALWAYS AS (concat(lpad(`STATION`,3,_latin1'0'),lpad(`JAAR`,4,_latin1'0'),lpad(`MAAND`,2,_latin1'0'),lpad(`DAG`,2,_latin1'0'))) STORED,
  UNIQUE KEY `I_NEERSLAGGEG` (`STATION`,`JAAR`,`MAAND`,`DAG`),
  UNIQUE KEY `I_NEERSLAGGEG_DATUM` (`STATION`,`DATUM`),
  KEY `I_NEERSLAGGEG_JAAR` (`STATION`,`JAAR`),
  KEY `I_NEERSLAGGEG_WEEK` (`STATION`,`JAAR`,`WEEK`),
  KEY `idx_neerslaggeg_sync_key` (`SYNC_KEY`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `neerslagstations`
--

DROP TABLE IF EXISTS `neerslagstations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `neerslagstations` (
  `CODE` smallint NOT NULL,
  `OMSCHRIJVING` varchar(40) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `import` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`CODE`),
  UNIQUE KEY `PK_NEERSLAGSTATIONS` (`CODE`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--

--
-- Table structure for table `reports`
--

DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `dataset_id` int NOT NULL,
  `timebase` enum('uur','dag','week','maand','seizoen','decade','jaar','overzicht') NOT NULL,
  `query` longtext NOT NULL,
  `input_station` tinyint(1) NOT NULL DEFAULT '0',
  `input_neerslagstation` tinyint(1) NOT NULL DEFAULT '0',
  `input_jaar` tinyint(1) NOT NULL DEFAULT '0',
  `input_maand` tinyint(1) NOT NULL DEFAULT '0',
  `input_week` tinyint(1) NOT NULL DEFAULT '0',
  `input_dag` tinyint(1) NOT NULL DEFAULT '0',
  `input_seizoen` tinyint(1) NOT NULL DEFAULT '0',
  `input_decade` tinyint(1) NOT NULL DEFAULT '0',
  `fieldName_station` varchar(50) DEFAULT NULL,
  `fieldName_neerslagstation` varchar(50) DEFAULT NULL,
  `fieldName_jaar` varchar(50) DEFAULT NULL,
  `fieldName_maand` varchar(50) DEFAULT NULL,
  `fieldName_week` varchar(50) DEFAULT NULL,
  `fieldName_dag` varchar(50) DEFAULT NULL,
  `fieldName_seizoen` varchar(50) DEFAULT NULL,
  `fieldName_decade` varchar(50) DEFAULT NULL,
  `sort_order` tinyint NOT NULL DEFAULT '0',
  `anychart_config` mediumtext,
  `chartjs_config` mediumtext,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_report_dataset_timebase` (`dataset_id`,`timebase`),
  CONSTRAINT `fk_reports_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `satellite_groups`
--

DROP TABLE IF EXISTS `satellite_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `satellite_groups` (
  `catalogNumber` varchar(10) NOT NULL,
  `groupName` varchar(20) NOT NULL,
  PRIMARY KEY (`catalogNumber`,`groupName`),
  CONSTRAINT `fk_satgroups_catalog` FOREIGN KEY (`catalogNumber`) REFERENCES `satellites` (`catalogNumber`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `satellites`
--

DROP TABLE IF EXISTS `satellites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `satellites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `catalogNumber` varchar(10) NOT NULL,
  `name` varchar(50) NOT NULL,
  `tle1` varchar(70) NOT NULL,
  `tle2` varchar(70) NOT NULL,
  `fetchedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sat_catalog` (`catalogNumber`)
) ENGINE=InnoDB AUTO_INCREMENT=62459 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--
-- Table structure for table `seizoensgegevens`
--

DROP TABLE IF EXISTS `seizoensgegevens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seizoensgegevens` (
  `STATION` smallint DEFAULT NULL,
  `JAAR` smallint DEFAULT NULL,
  `SEIZOEN` varchar(2) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TN_AVG` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `TX_AVG` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_SEIZOENSGEGEVENS` (`STATION`,`JAAR`,`SEIZOEN`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `seizoensnormen`
--

DROP TABLE IF EXISTS `seizoensnormen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seizoensnormen` (
  `STATION` smallint DEFAULT NULL,
  `DECENNIUM` smallint NOT NULL,
  `SEIZOEN` varchar(2) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `TG` decimal(12,2) DEFAULT NULL,
  `TN` decimal(12,2) DEFAULT NULL,
  `TX` decimal(12,2) DEFAULT NULL,
  `PG` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  UNIQUE KEY `I_SEIZOENSNORM2000` (`STATION`,`SEIZOEN`,`DECENNIUM`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--

--

--
-- Table structure for table `stars`
--

DROP TABLE IF EXISTS `stars`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stars` (
  `StarID` int NOT NULL,
  `Hip` int DEFAULT NULL,
  `HD` int DEFAULT NULL,
  `HR` int DEFAULT NULL,
  `Gliese` varchar(10) CHARACTER SET latin1 COLLATE latin1_german1_ci DEFAULT NULL,
  `BayerFlamsteed` varchar(20) CHARACTER SET latin1 COLLATE latin1_german1_ci DEFAULT NULL,
  `ProperName` varchar(20) CHARACTER SET latin1 COLLATE latin1_german1_ci DEFAULT NULL,
  `RA` decimal(12,8) DEFAULT NULL,
  `Decl` decimal(12,8) DEFAULT NULL,
  `Distance` decimal(20,12) DEFAULT NULL,
  `Mag` decimal(5,2) DEFAULT NULL,
  `AbsMag` decimal(24,16) DEFAULT NULL,
  `Spectrum` varchar(10) CHARACTER SET latin1 COLLATE latin1_german1_ci DEFAULT NULL,
  `ColorIndex` decimal(8,3) DEFAULT NULL,
  PRIMARY KEY (`StarID`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_german1_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stations`
--

DROP TABLE IF EXISTS `stations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stations` (
  `CODE` smallint NOT NULL,
  `OMSCHRIJVING` varchar(40) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `import` tinyint(1) NOT NULL DEFAULT '0',
  `metar` varchar(4) DEFAULT NULL,
  `wmo` varchar(5) DEFAULT NULL,
  PRIMARY KEY (`CODE`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--

--
-- Table structure for table `superhittegolven`
--

DROP TABLE IF EXISTS `superhittegolven`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `superhittegolven` (
  `station` smallint NOT NULL,
  `volgnr` int NOT NULL,
  `begin` date NOT NULL,
  `einde` date NOT NULL,
  `dagen` int NOT NULL,
  `supertropisch` int NOT NULL,
  `tmax` decimal(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_german1_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--
-- Table structure for table `uurgeg`
--

DROP TABLE IF EXISTS `uurgeg`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `uurgeg` (
  `STATION` smallint NOT NULL,
  `JAAR` smallint NOT NULL,
  `MAAND` tinyint NOT NULL,
  `DAG` tinyint NOT NULL,
  `DATUM` date NOT NULL,
  `UUR` tinyint NOT NULL,
  `DATUM_TIJD_VAN` datetime NOT NULL,
  `DATUM_TIJD_TOT` datetime NOT NULL,
  `DD` decimal(12,2) DEFAULT NULL,
  `FH` decimal(12,2) DEFAULT NULL,
  `FF` decimal(12,2) DEFAULT NULL,
  `FX` decimal(12,2) DEFAULT NULL,
  `T` decimal(12,2) DEFAULT NULL,
  `T10` decimal(12,2) DEFAULT NULL,
  `TD` decimal(12,2) DEFAULT NULL,
  `SQ` decimal(12,2) DEFAULT NULL,
  `Q` decimal(12,2) DEFAULT NULL,
  `DR` decimal(12,2) DEFAULT NULL,
  `RH` decimal(12,2) DEFAULT NULL,
  `P` decimal(12,2) DEFAULT NULL,
  `VV` decimal(12,2) DEFAULT NULL,
  `N` decimal(12,2) DEFAULT NULL,
  `U` decimal(12,2) DEFAULT NULL,
  `WW` tinyint DEFAULT NULL,
  `IX` tinyint DEFAULT NULL,
  `M` tinyint DEFAULT NULL,
  `R` tinyint DEFAULT NULL,
  `S` tinyint DEFAULT NULL,
  `O` tinyint DEFAULT NULL,
  `Y` tinyint DEFAULT NULL,
  `WEEK` tinyint NOT NULL,
  `JAAR_WEEK` smallint NOT NULL,
  `SEIZOEN` varchar(2) NOT NULL,
  `JAAR_SEIZOEN` smallint NOT NULL,
  `DECADE` tinyint NOT NULL,
  `WINTER` smallint NOT NULL,
  `SYNC_KEY` varchar(13) GENERATED ALWAYS AS (concat(lpad(`STATION`,3,_latin1'0'),lpad(`JAAR`,4,_latin1'0'),lpad(`MAAND`,2,_latin1'0'),lpad(`DAG`,2,_latin1'0'),lpad(`UUR`,2,_latin1'0'))) STORED,
  UNIQUE KEY `I_UURGEG` (`STATION`,`JAAR`,`MAAND`,`DAG`,`UUR`),
  KEY `I_UURGEG_SEIZOEN` (`STATION`,`JAAR_SEIZOEN`,`SEIZOEN`),
  KEY `I_UURGEG_WEEK` (`STATION`,`JAAR_WEEK`,`WEEK`),
  KEY `idx_uurgeg_sync_key` (`SYNC_KEY`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `v_etmgeg`
--

DROP TABLE IF EXISTS `v_etmgeg`;
/*!50001 DROP VIEW IF EXISTS `v_etmgeg`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_etmgeg` AS SELECT 
 1 AS `SYNC_KEY`,
 1 AS `STATION`,
 1 AS `JAAR`,
 1 AS `MAAND`,
 1 AS `DAG`,
 1 AS `DDVEC`,
 1 AS `FHVEC`,
 1 AS `FG`,
 1 AS `FHX`,
 1 AS `FHXH`,
 1 AS `FHN`,
 1 AS `FHNH`,
 1 AS `FXX`,
 1 AS `FXXH`,
 1 AS `TG`,
 1 AS `TN`,
 1 AS `TNH`,
 1 AS `TX`,
 1 AS `TXH`,
 1 AS `T10N`,
 1 AS `T10NH`,
 1 AS `SQ`,
 1 AS `SP`,
 1 AS `Q`,
 1 AS `DR`,
 1 AS `RH`,
 1 AS `RHX`,
 1 AS `RHXH`,
 1 AS `PG`,
 1 AS `PX`,
 1 AS `PXH`,
 1 AS `PN`,
 1 AS `PNH`,
 1 AS `VVN`,
 1 AS `VVNH`,
 1 AS `VVX`,
 1 AS `VVXH`,
 1 AS `NG`,
 1 AS `UG`,
 1 AS `UX`,
 1 AS `UXH`,
 1 AS `UN`,
 1 AS `UNH`,
 1 AS `EV24`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_daily`
--

DROP TABLE IF EXISTS `v_knmidata_daily`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_daily`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_daily` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `datum`,
 1 AS `tg`,
 1 AS `tn`,
 1 AS `tx`,
 1 AS `pg`,
 1 AS `sq`,
 1 AS `q`,
 1 AS `rh`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_main_daily`
--

DROP TABLE IF EXISTS `v_knmidata_main_daily`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_daily`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_main_daily` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `datum`,
 1 AS `tg`,
 1 AS `tn`,
 1 AS `tx`,
 1 AS `pg`,
 1 AS `sq`,
 1 AS `q`,
 1 AS `rh`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_main_decade`
--

DROP TABLE IF EXISTS `v_knmidata_main_decade`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_decade`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_main_decade` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `tg`,
 1 AS `tn`,
 1 AS `tn_avg`,
 1 AS `tx`,
 1 AS `tx_avg`,
 1 AS `pg`,
 1 AS `sq`,
 1 AS `q`,
 1 AS `rh`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_main_hourly`
--

DROP TABLE IF EXISTS `v_knmidata_main_hourly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_hourly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_main_hourly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `dag`,
 1 AS `uur`,
 1 AS `datum_tijd`,
 1 AS `t`,
 1 AS `td`,
 1 AS `fh`,
 1 AS `p`,
 1 AS `sq`,
 1 AS `rh`,
 1 AS `u`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_main_monthly`
--

DROP TABLE IF EXISTS `v_knmidata_main_monthly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_monthly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_main_monthly` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `maandnummer`,
 1 AS `tg`,
 1 AS `tn`,
 1 AS `tn_avg`,
 1 AS `tx`,
 1 AS `tx_avg`,
 1 AS `pg`,
 1 AS `sq`,
 1 AS `q`,
 1 AS `rh`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_main_seizoen`
--

DROP TABLE IF EXISTS `v_knmidata_main_seizoen`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_seizoen`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_main_seizoen` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `seizoen`,
 1 AS `tg`,
 1 AS `tn`,
 1 AS `tn_avg`,
 1 AS `tx`,
 1 AS `tx_avg`,
 1 AS `pg`,
 1 AS `sq`,
 1 AS `q`,
 1 AS `rh`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_main_yearly`
--

DROP TABLE IF EXISTS `v_knmidata_main_yearly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_yearly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_main_yearly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `tg`,
 1 AS `tn`,
 1 AS `tn_avg`,
 1 AS `tx`,
 1 AS `tx_avg`,
 1 AS `pg`,
 1 AS `sq`,
 1 AS `q`,
 1 AS `rh`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_monthly`
--

DROP TABLE IF EXISTS `v_knmidata_monthly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_monthly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_monthly` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `maandnummer`,
 1 AS `tg`,
 1 AS `tn`,
 1 AS `tx`,
 1 AS `pg`,
 1 AS `sq`,
 1 AS `q`,
 1 AS `rh`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_pres_daily`
--

DROP TABLE IF EXISTS `v_knmidata_pres_daily`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_daily`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_pres_daily` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `datum`,
 1 AS `pg`,
 1 AS `pn`,
 1 AS `px`,
 1 AS `pg_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_pres_decade`
--

DROP TABLE IF EXISTS `v_knmidata_pres_decade`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_decade`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_pres_decade` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `pg`,
 1 AS `pg_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_pres_hourly`
--

DROP TABLE IF EXISTS `v_knmidata_pres_hourly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_hourly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_pres_hourly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `dag`,
 1 AS `uur`,
 1 AS `datum_tijd`,
 1 AS `p`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_pres_monthly`
--

DROP TABLE IF EXISTS `v_knmidata_pres_monthly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_monthly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_pres_monthly` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `maandnummer`,
 1 AS `pg`,
 1 AS `pg_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_pres_seizoen`
--

DROP TABLE IF EXISTS `v_knmidata_pres_seizoen`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_seizoen`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_pres_seizoen` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `seizoen`,
 1 AS `pg`,
 1 AS `pg_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_pres_yearly`
--

DROP TABLE IF EXISTS `v_knmidata_pres_yearly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_yearly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_pres_yearly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `pg`,
 1 AS `pg_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_rain_daily`
--

DROP TABLE IF EXISTS `v_knmidata_rain_daily`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_daily`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_rain_daily` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `datum`,
 1 AS `rh`,
 1 AS `rh_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_rain_decade`
--

DROP TABLE IF EXISTS `v_knmidata_rain_decade`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_decade`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_rain_decade` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `rh`,
 1 AS `rh_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_rain_hourly`
--

DROP TABLE IF EXISTS `v_knmidata_rain_hourly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_hourly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_rain_hourly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `dag`,
 1 AS `uur`,
 1 AS `datum_tijd`,
 1 AS `rh`,
 1 AS `dr`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_rain_monthly`
--

DROP TABLE IF EXISTS `v_knmidata_rain_monthly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_monthly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_rain_monthly` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `maandnummer`,
 1 AS `rh`,
 1 AS `rh_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_rain_seizoen`
--

DROP TABLE IF EXISTS `v_knmidata_rain_seizoen`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_seizoen`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_rain_seizoen` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `seizoen`,
 1 AS `rh`,
 1 AS `rh_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_rain_yearly`
--

DROP TABLE IF EXISTS `v_knmidata_rain_yearly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_yearly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_rain_yearly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `rh`,
 1 AS `rh_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_sun_daily`
--

DROP TABLE IF EXISTS `v_knmidata_sun_daily`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_daily`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_sun_daily` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `datum`,
 1 AS `sq`,
 1 AS `sq_norm`,
 1 AS `q`,
 1 AS `q_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_sun_decade`
--

DROP TABLE IF EXISTS `v_knmidata_sun_decade`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_decade`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_sun_decade` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `sq`,
 1 AS `sq_norm`,
 1 AS `q`,
 1 AS `q_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_sun_hourly`
--

DROP TABLE IF EXISTS `v_knmidata_sun_hourly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_hourly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_sun_hourly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `dag`,
 1 AS `uur`,
 1 AS `datum_tijd`,
 1 AS `sq`,
 1 AS `q`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_sun_monthly`
--

DROP TABLE IF EXISTS `v_knmidata_sun_monthly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_monthly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_sun_monthly` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `maandnummer`,
 1 AS `sq`,
 1 AS `sq_norm`,
 1 AS `q`,
 1 AS `q_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_sun_seizoen`
--

DROP TABLE IF EXISTS `v_knmidata_sun_seizoen`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_seizoen`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_sun_seizoen` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `seizoen`,
 1 AS `sq`,
 1 AS `sq_norm`,
 1 AS `q`,
 1 AS `q_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_sun_yearly`
--

DROP TABLE IF EXISTS `v_knmidata_sun_yearly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_yearly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_sun_yearly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `sq`,
 1 AS `sq_norm`,
 1 AS `q`,
 1 AS `q_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_temp_daily`
--

DROP TABLE IF EXISTS `v_knmidata_temp_daily`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_daily`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_temp_daily` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `datum`,
 1 AS `tg`,
 1 AS `tg_norm`,
 1 AS `tn`,
 1 AS `tn_norm`,
 1 AS `tx`,
 1 AS `tx_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_temp_decade`
--

DROP TABLE IF EXISTS `v_knmidata_temp_decade`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_decade`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_temp_decade` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `tg`,
 1 AS `tg_norm`,
 1 AS `tn`,
 1 AS `tn_avg`,
 1 AS `tn_norm`,
 1 AS `tx`,
 1 AS `tx_avg`,
 1 AS `tx_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_temp_hourly`
--

DROP TABLE IF EXISTS `v_knmidata_temp_hourly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_hourly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_temp_hourly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `dag`,
 1 AS `uur`,
 1 AS `datum_tijd`,
 1 AS `t`,
 1 AS `t10`,
 1 AS `td`,
 1 AS `u`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_temp_monthly`
--

DROP TABLE IF EXISTS `v_knmidata_temp_monthly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_monthly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_temp_monthly` AS SELECT 
 1 AS `sc_station`,
 1 AS `sc_jaar`,
 1 AS `sc_maand`,
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `maandnummer`,
 1 AS `tg`,
 1 AS `tg_norm`,
 1 AS `tn`,
 1 AS `tn_avg`,
 1 AS `tn_norm`,
 1 AS `tx`,
 1 AS `tx_avg`,
 1 AS `tx_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_temp_seizoen`
--

DROP TABLE IF EXISTS `v_knmidata_temp_seizoen`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_seizoen`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_temp_seizoen` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `seizoen`,
 1 AS `tg`,
 1 AS `tg_norm`,
 1 AS `tn`,
 1 AS `tn_avg`,
 1 AS `tn_norm`,
 1 AS `tx`,
 1 AS `tx_avg`,
 1 AS `tx_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_temp_yearly`
--

DROP TABLE IF EXISTS `v_knmidata_temp_yearly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_yearly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_temp_yearly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `tg`,
 1 AS `tg_norm`,
 1 AS `tn`,
 1 AS `tn_avg`,
 1 AS `tn_norm`,
 1 AS `tx`,
 1 AS `tx_avg`,
 1 AS `tx_norm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_knmidata_wind_hourly`
--

DROP TABLE IF EXISTS `v_knmidata_wind_hourly`;
/*!50001 DROP VIEW IF EXISTS `v_knmidata_wind_hourly`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_knmidata_wind_hourly` AS SELECT 
 1 AS `stationsCode`,
 1 AS `station`,
 1 AS `jaar`,
 1 AS `maand`,
 1 AS `decade`,
 1 AS `dag`,
 1 AS `uur`,
 1 AS `datum_tijd`,
 1 AS `fh`,
 1 AS `ff`,
 1 AS `fx`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_neerslaggeg`
--

DROP TABLE IF EXISTS `v_neerslaggeg`;
/*!50001 DROP VIEW IF EXISTS `v_neerslaggeg`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_neerslaggeg` AS SELECT 
 1 AS `SYNC_KEY`,
 1 AS `STATION`,
 1 AS `JAAR`,
 1 AS `MAAND`,
 1 AS `DAG`,
 1 AS `RD`,
 1 AS `SX`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_solaredge_daily`
--

-- Table structure for table `vorstperiodes`
--

DROP TABLE IF EXISTS `vorstperiodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vorstperiodes` (
  `station` int NOT NULL,
  `volgnr` int NOT NULL,
  `begin` date NOT NULL,
  `einde` date NOT NULL,
  `dagen` int NOT NULL,
  `hellmann` decimal(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_german1_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--

--

--

--
-- Dumping routines for database 'knmi'
--
/*!50003 DROP PROCEDURE IF EXISTS `UpdateHistory` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateHistory`()
BEGIN  
   CALL UpdatePeriodeGegevens;
   INSERT INTO logfile (datum,logtext) VALUES (SYSDATE(),'UpdatePeriodeGegevens done!'); 
   CALL UpdateNormen;
   INSERT INTO logfile (datum,logtext) VALUES (SYSDATE(),'UpdateNormen done!'); 
   CALL UpdateVorstperiodes;
   INSERT INTO logfile (datum,logtext) VALUES (SYSDATE(),'UpdateVorstperiodes done!'); 
   CALL UpdateKoudegolven;
   INSERT INTO logfile (datum,logtext) VALUES (SYSDATE(),'UpdateKoudegolven done!'); 
   CALL UpdateHittegolven;
   INSERT INTO logfile (datum,logtext) VALUES (SYSDATE(),'UpdateHittegolven done!'); 
   CALL UpdateSuperHittegolven;
   INSERT INTO logfile (datum,logtext) VALUES (SYSDATE(),'UpdateSuperHittegolven done!'); 
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `UpdateHittegolven` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateHittegolven`()
BEGIN

   DECLARE v_finished 										   INTEGER DEFAULT 0;
   DECLARE v_firstrecord                                       INTEGER DEFAULT 0;
   DECLARE vVORIGESTATION, vSTATION, vVOLGNR, vTELLER, vTD     INTEGER;
   DECLARE vVORIGEDATUM, vVANDAAG, vGISTEREN, vBEGIN, vEINDE   DATE;
   DECLARE vTG, vTX, vMAX                                      DOUBLE;

   DECLARE C3 CURSOR FOR
                SELECT EG.STATION,
                       EG.DATUM,
                       EG.DATUM - INTERVAL 1 DAY AS GISTEREN,
                       EG.TG,
                       EG.TX
                  FROM etmgeg EG
                 WHERE EG.TX >= 25
              ORDER BY EG.STATION, EG.DATUM;
   
   DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_finished = 1;

   TRUNCATE TABLE hittegolven;

   SET vVORIGESTATION = 0;
   SET vVOLGNR = 0;
   SET vVORIGEDATUM = STR_TO_DATE("1899-12-31", "%Y-%m-%d");
   SET v_firstrecord = 1;
   SET vTELLER = 0;
   SET vTD = 0;

   OPEN C3;

  GET_HITTEGOLVEN: LOOP

      FETCH C3 INTO vSTATION, vVANDAAG, vGISTEREN, vTG, vTX;

      IF v_finished = 1 THEN 
        LEAVE GET_HITTEGOLVEN;
      END IF;

      IF (v_firstrecord = 1) OR ((vSTATION = vVORIGESTATION) AND (vGISTEREN = vVORIGEDATUM))
      THEN
         SET vTELLER = vTELLER + 1;
         SET vEINDE = vVANDAAG;

         IF (vTX > vMAX)
         THEN
            SET vMAX = vTX;
         END IF;

         IF (vTX >= 30)
         THEN
            SET vTD = vTD + 1;
         END IF;
      ELSE
         IF (vTELLER >= 5) AND (vTD >= 3)
         THEN
            SET vVOLGNR = vVOLGNR + 1;

            INSERT INTO hittegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, TROPISCH, TMAX) VALUES (vVORIGESTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vTD, vMAX);
         END IF;

         IF (vSTATION <> vVORIGESTATION) THEN 
           SET vVOLGNR = 0;
         END IF;
         
         SET vTELLER = 1;
         SET vBEGIN = vVANDAAG;
         SET vMAX = vTX;

         IF (vTX >= 30)
         THEN
            SET vTD = 1;
         ELSE
            SET vTD = 0;
         END IF;
      END IF;

      SET v_firstrecord = 0;
      SET vVORIGEDATUM = vVANDAAG;
      SET vVORIGESTATION = vSTATION;
      
   END LOOP GET_HITTEGOLVEN;

   CLOSE C3;

   IF (vTELLER >= 5) AND (vTD >= 3)
   THEN
      SET vVOLGNR = vVOLGNR + 1;

      INSERT INTO hittegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, TROPISCH, TMAX) VALUES (vSTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vTD, vMAX);
   END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `UpdateKoudegolven` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateKoudegolven`()
BEGIN

   DECLARE v_finished                                          INTEGER DEFAULT 0;
   DECLARE v_firstrecord                                       INTEGER DEFAULT 0;
   DECLARE vVORIGESTATION, vSTATION, vVOLGNR, vTELLER, vSVD    INTEGER;
   DECLARE vVORIGEDATUM, vVANDAAG, vGISTEREN, vBEGIN, vEINDE   DATE;
   DECLARE vHELLMANN, vTG, vTN, vMIN                           DOUBLE;

   DECLARE C2 CURSOR FOR
                SELECT EG.STATION,
                       EG.DATUM,
                       EG.DATUM - INTERVAL 1 DAY AS GISTEREN,
                       EG.TG,
                       EG.TN
                  FROM etmgeg EG
                 WHERE EG.TX < 0
              ORDER BY EG.STATION, EG.DATUM;

   DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_finished = 1;

   TRUNCATE TABLE koudegolven;

   SET vVORIGESTATION = 0;
   SET vVOLGNR = 0;
   SET vVORIGEDATUM = STR_TO_DATE("1899-12-31", "%Y-%m-%d");
   SET v_firstrecord = 1;
   SET vTELLER = 0;
   SET vSVD = 0;

   OPEN C2;

  GET_KOUDEGOLVEN:
   LOOP
      FETCH C2
         INTO vSTATION, vVANDAAG, vGISTEREN, vTG, vTN;

      IF v_finished = 1
      THEN
         LEAVE GET_KOUDEGOLVEN;
      END IF;

      IF (v_firstrecord = 1) OR ((vSTATION = vVORIGESTATION) AND (vGISTEREN = vVORIGEDATUM))
      THEN
         SET vTELLER = vTELLER + 1;
         SET vEINDE = vVANDAAG;
         SET vHELLMANN = vHELLMANN - vTG;

         IF (vTN < vMIN)
         THEN
            SET vMIN = vTN;
         END IF;

         IF (vTN < -10)
         THEN
            SET vSVD = vSVD + 1;
         END IF;
      ELSE
         IF (vTELLER >= 5) AND (vSVD >= 3)
         THEN
            SET vVOLGNR = vVOLGNR + 1;

            INSERT INTO koudegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, STRENG, TMIN, HELLMANN) VALUES (vVORIGESTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vSVD, vMIN, vHELLMANN);
         END IF;

         IF (vSTATION <> vVORIGESTATION) THEN 
           SET vVOLGNR = 0;
         END IF;

         SET vTELLER = 1;
         SET vBEGIN = vVANDAAG;
         SET vHELLMANN = -vTG;
         SET vMIN = vTN;

         IF (vTN < -10)
         THEN
            SET vSVD = 1;
         ELSE
            SET vSVD = 0;
         END IF;
      END IF;

      SET v_firstrecord = 0;
      SET vVORIGEDATUM = vVANDAAG;
      SET vVORIGESTATION = vSTATION;
      
   END LOOP GET_KOUDEGOLVEN;

   CLOSE C2;

   IF (vTELLER >= 5) AND (vSVD >= 3)
   THEN
      SET vVOLGNR = vVOLGNR + 1;

      INSERT INTO koudegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, STRENG, TMIN, HELLMANN) VALUES (vSTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vSVD, vHELLMANN, vMIN);
   END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `UpdateNormen` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateNormen`()
BEGIN

   DECLARE vJAAR_VAN INT;
   DECLARE vJAAR_TM INT;
   DECLARE I INT;

   TRUNCATE TABLE dagnormen_raw;

   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;

   INSERT INTO dagnormen_raw(STATION,
                             DECENNIUM,
                             MAAND,
                             DAG,
                             TG,
                             TN,
                             TX,
                             PG,
                             SQ,
                             RH,
                             Q)
        SELECT EG.STATION,
               vJAAR_TM,
               EG.MAAND,
               EG.DAG,
               ROUND(AVG(EG.TG), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(AVG(EG.SQ), 1),
               ROUND(AVG(EG.RH), 1),
               ROUND(AVG(EG.Q), 1)
          FROM etmgeg EG
         WHERE EG.JAAR >= vJAAR_VAN AND EG.JAAR <= vJAAR_TM
      GROUP BY EG.STATION, EG.MAAND, EG.DAG;

      SET I = I + 1;
   END WHILE;

   UPDATE dagnormen_raw
   SET DOY = CASE
	  WHEN MAAND = 1  THEN DAG
	  WHEN MAAND = 2  THEN 31 + DAG
	  WHEN MAAND = 3  THEN 60 + DAG -- March starts on day 60 in leap years
      WHEN MAAND = 4  THEN 91 + DAG
	  WHEN MAAND = 5  THEN 121 + DAG
	  WHEN MAAND = 6  THEN 152 + DAG
	  WHEN MAAND = 7  THEN 182 + DAG
	  WHEN MAAND = 8  THEN 213 + DAG
	  WHEN MAAND = 9  THEN 244 + DAG
	  WHEN MAAND = 10 THEN 274 + DAG
	  WHEN MAAND = 11 THEN 305 + DAG
	  WHEN MAAND = 12 THEN 335 + DAG
   END;

   TRUNCATE TABLE dagnormen;
   
   INSERT INTO dagnormen(STATION,
                             DECENNIUM,
                             MAAND,
                             DAG,
                             TG,
                             TN,
                             TX,
                             PG,
                             SQ,
                             RH,
                             Q)
				SELECT dn1.STATION,
   					   dn1.DECENNIUM,
					   dn1.MAAND,
					   dn1.DAG,		  
					   ROUND(AVG(dn2.TG), 1),
					   ROUND(AVG(dn2.TN), 1),
					   ROUND(AVG(dn2.TX), 1),
					   ROUND(AVG(dn2.PG), 1),
					   ROUND(AVG(dn2.SQ), 1),
					   ROUND(AVG(dn2.RH), 1),
					   ROUND(AVG(dn2.Q), 1)
				  FROM dagnormen_raw dn1
				  JOIN dagnormen_raw dn2 ON dn2.STATION = dn1.STATION AND dn2.DECENNIUM = dn1.DECENNIUM
											AND (
													dn2.DOY BETWEEN dn1.DOY - 3 AND dn1.DOY + 3
													OR dn2.DOY BETWEEN (dn1.DOY - 3 + 366) AND 366
													OR dn2.DOY BETWEEN 1 AND (dn1.DOY + 3 - 366)
												)
			  GROUP BY dn1.STATION,
				       dn1.DECENNIUM,
				       dn1.MAAND,
   				       dn1.DAG;

   TRUNCATE TABLE maandnormen;

   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;

   INSERT INTO maandnormen(STATION,
							   DECENNIUM,
                               MAAND,
                               TG,
                               TN,
                               TX,
                               PG,
                               SQ,
                               RH,
                               Q)
        SELECT MG.STATION,
               vJAAR_TM,
               MG.MAAND,
               ROUND(AVG(MG.TG), 1),
               ROUND(AVG(MG.TN_AVG), 1),
               ROUND(AVG(MG.TX_AVG), 1),
               ROUND(AVG(MG.PG), 1),
               ROUND(AVG(MG.SQ), 1),
               ROUND(AVG(MG.RH), 1),
               ROUND(AVG(MG.Q), 1)
          FROM maandgegevens MG
         WHERE MG.JAAR >= vJAAR_VAN AND MG.JAAR <= vJAAR_TM
      GROUP BY MG.STATION, MG.MAAND;
   
      SET I = I + 1;
   END WHILE;
   
   TRUNCATE TABLE jaarnormen;

   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;

   INSERT INTO jaarnormen(STATION,
                            DECENNIUM,
                            TG,
                            TN,
                            TX,
                            PG,
                            SQ,
                            RH,
                            Q)
        SELECT JG.STATION,
               vJAAR_TM,
               ROUND(AVG(JG.TG), 1),
               ROUND(AVG(JG.TN_AVG), 1),
               ROUND(AVG(JG.TX_AVG), 1),
               ROUND(AVG(JG.PG), 1),
               ROUND(AVG(JG.SQ), 1),
               ROUND(AVG(JG.RH), 1),
               ROUND(AVG(JG.Q), 1)
          FROM jaargegevens JG
         WHERE JG.JAAR >= vJAAR_VAN AND JG.JAAR <= vJAAR_TM
      GROUP BY JG.STATION;

      SET I = I + 1;
   END WHILE;

   TRUNCATE TABLE decadenormen;

   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;

   INSERT INTO decadenormen(STATION,
                              DECENNIUM,
  							  MAAND,
							  DECADE,
							  TG,
							  TN,
							  TX,
							  PG,
							  SQ,
							  RH,
							  Q)
        SELECT DG.STATION,
               vJAAR_TM,
               DG.MAAND,
               DG.DECADE,
               ROUND(AVG(DG.TG), 1),
               ROUND(AVG(DG.TN_AVG), 1),
               ROUND(AVG(DG.TX_AVG), 1),
               ROUND(AVG(DG.PG), 1),
               ROUND(AVG(DG.SQ), 1),
               ROUND(AVG(DG.RH), 1),
               ROUND(AVG(DG.Q), 1)
          FROM decadegegevens DG
         WHERE DG.JAAR >= vJAAR_VAN AND DG.JAAR <= vJAAR_TM
      GROUP BY DG.STATION, DG.MAAND, DG.DECADE;
   
      SET I = I + 1;
   END WHILE;
   
   TRUNCATE TABLE seizoensnormen;

   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;

   INSERT INTO seizoensnormen(STATION,
                                DECENNIUM,
                                SEIZOEN,
                                TG,
                                TN,
                                TX,
                                PG,
                                SQ,
                                RH,
                                Q)
        SELECT SG.STATION,
               vJAAR_TM,
               SG.SEIZOEN,
               ROUND(AVG(SG.TG), 1),
               ROUND(AVG(SG.TN_AVG), 1),
               ROUND(AVG(SG.TX_AVG), 1),
               ROUND(AVG(SG.PG), 1),
               ROUND(AVG(SG.SQ), 1),
               ROUND(AVG(SG.RH), 1),
               ROUND(AVG(SG.Q), 1)
          FROM seizoensgegevens SG
         WHERE SG.JAAR >= vJAAR_VAN AND SG.JAAR <= vJAAR_TM
      GROUP BY SG.STATION, SG.SEIZOEN;

      SET I = I + 1;
   END WHILE;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `UpdatePeriodeGegevens` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdatePeriodeGegevens`()
BEGIN
   TRUNCATE TABLE maandgegevens;

   INSERT INTO maandgegevens(STATION,
                             JAAR,
                             MAAND,
                             TG,
                             TN,
                             TN_AVG,
                             TX,
                             TX_AVG,
                             PG,
                             SQ,
                             RH,
                             Q)
        SELECT EG.STATION,
               EG.JAAR,
               EG.MAAND,
               ROUND(AVG(EG.TG), 1),
               ROUND(MIN(EG.TN), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(MAX(EG.TX), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(SUM(EG.SQ), 1),
               ROUND(SUM(EG.RH), 1),
               ROUND(SUM(EG.Q), 1)
          FROM etmgeg EG
      GROUP BY EG.STATION, EG.JAAR, EG.MAAND;

   TRUNCATE TABLE jaargegevens;

   INSERT INTO jaargegevens(STATION,
                            JAAR,
                            TG,
                            TN,
                            TN_AVG,
                            TX,
                            TX_AVG,
                            PG,
                            SQ,
                            RH,
                            Q)
        SELECT EG.STATION,
               EG.JAAR,
               ROUND(AVG(EG.TG), 1),
               ROUND(MIN(EG.TN), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(MAX(EG.TX), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(SUM(EG.SQ), 1),
               ROUND(SUM(EG.RH), 1),
               ROUND(SUM(EG.Q), 1)
          FROM etmgeg EG
      GROUP BY EG.STATION, EG.JAAR;

   TRUNCATE TABLE decadegegevens;

   INSERT INTO decadegegevens(STATION,
                              JAAR,
                              MAAND,
                              DECADE,
                              TG,
                              TN,
                              TN_AVG,
                              TX,
                              TX_AVG,
                              PG,
                              SQ,
                              RH,
                              Q)
        SELECT EG.STATION,
               EG.JAAR,
               EG.MAAND,
               EG.DECADE,
               ROUND(AVG(EG.TG), 1),
               ROUND(MIN(EG.TN), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(MAX(EG.TX), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(SUM(EG.SQ), 1),
               ROUND(SUM(EG.RH), 1),
               ROUND(SUM(EG.Q), 1)
          FROM etmgeg EG
      GROUP BY EG.STATION,
               EG.JAAR,
               EG.MAAND,
               EG.DECADE;
               
   TRUNCATE TABLE seizoensgegevens;

   INSERT INTO seizoensgegevens(STATION,
                                JAAR,
                                SEIZOEN,
                                TG,
                                TN,
                                TN_AVG,
                                TX,
                                TX_AVG,
                                PG,
                                SQ,
                                RH,
                                Q)
        SELECT EG.STATION,
               EG.JAAR_SEIZOEN,
               EG.SEIZOEN,
               ROUND(AVG(EG.TG), 1),
               ROUND(MIN(EG.TN), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(MAX(EG.TX), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(SUM(EG.SQ), 1),
               ROUND(SUM(EG.RH), 1),
               ROUND(SUM(EG.Q), 1)
          FROM etmgeg EG
      GROUP BY EG.STATION, EG.JAAR_SEIZOEN, EG.SEIZOEN;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `UpdateSuperHittegolven` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateSuperHittegolven`()
BEGIN

   DECLARE v_finished 										   INTEGER DEFAULT 0;
   DECLARE v_firstrecord                                       INTEGER DEFAULT 0;
   DECLARE vVORIGESTATION, vSTATION, vVOLGNR, vTELLER, vSTD     INTEGER;
   DECLARE vVORIGEDATUM, vVANDAAG, vGISTEREN, vBEGIN, vEINDE   DATE;
   DECLARE vTG, vTX, vMAX                                      DOUBLE;

   DECLARE C3 CURSOR FOR
                SELECT EG.STATION,
                       EG.DATUM,
                       EG.DATUM - INTERVAL 1 DAY AS GISTEREN,
                       EG.TG,
                       EG.TX
                  FROM etmgeg EG
                 WHERE EG.TX >= 30
              ORDER BY EG.STATION, EG.DATUM;
   
   DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_finished = 1;

   TRUNCATE TABLE superhittegolven;

   SET vVORIGESTATION = 0;
   SET vVOLGNR = 0;
   SET vVORIGEDATUM = STR_TO_DATE("1899-12-31", "%Y-%m-%d");
   SET v_firstrecord = 1;
   SET vTELLER = 0;
   SET vSTD = 0;

   OPEN C3;

  GET_HITTEGOLVEN: LOOP

      FETCH C3 INTO vSTATION, vVANDAAG, vGISTEREN, vTG, vTX;

      IF v_finished = 1 THEN 
        LEAVE GET_HITTEGOLVEN;
      END IF;

      IF (v_firstrecord = 1) OR ((vSTATION = vVORIGESTATION) AND (vGISTEREN = vVORIGEDATUM))
      THEN
         SET vTELLER = vTELLER + 1;
         SET vEINDE = vVANDAAG;

         IF (vTX > vMAX)
         THEN
            SET vMAX = vTX;
         END IF;

         IF (vTX >= 35)
         THEN
            SET vSTD = vSTD + 1;
         END IF;
      ELSE
         IF (vTELLER >= 5) AND (vSTD >= 3)
         THEN
            SET vVOLGNR = vVOLGNR + 1;

            INSERT INTO superhittegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, SUPERTROPISCH, TMAX) VALUES (vVORIGESTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vSTD, vMAX);
         END IF;

         IF (vSTATION <> vVORIGESTATION) THEN 
           SET vVOLGNR = 0;
         END IF;

         SET vTELLER = 1;
         SET vBEGIN = vVANDAAG;
         SET vMAX = vTX;

         IF (vTX >= 35)
         THEN
            SET vSTD = 1;
         ELSE
            SET vSTD = 0;
         END IF;
      END IF;

      SET v_firstrecord = 0;
      SET vVORIGEDATUM = vVANDAAG;
      SET vVORIGESTATION = vSTATION;
      
   END LOOP GET_HITTEGOLVEN;

   CLOSE C3;

   IF (vTELLER >= 5) AND (vSTD >= 3)
   THEN
      SET vVOLGNR = vVOLGNR + 1;

      INSERT INTO superhittegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, SUPERTROPISCH, TMAX) VALUES (vSTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vSTD, vMAX);
   END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `UpdateVorstperiodes` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateVorstperiodes`()
BEGIN

   DECLARE v_finished                                          INTEGER DEFAULT 0;
   DECLARE v_firstrecord                                       INTEGER DEFAULT 0;
   DECLARE vVORIGESTATION, vSTATION, vVOLGNR, vTELLER          INTEGER;
   DECLARE vVORIGEDATUM, vVANDAAG, vGISTEREN, vBEGIN, vEINDE   DATE;
   DECLARE vHELLMANN, vTG                                      DOUBLE;

   DECLARE C1 CURSOR FOR
                SELECT EG.STATION, EG.DATUM, EG.DATUM - INTERVAL 1 DAY AS GISTEREN, EG.TG
                  FROM etmgeg EG
                 WHERE EG.TG < 0
              ORDER BY EG.STATION, EG.DATUM;
   DECLARE CONTINUE HANDLER FOR NOT FOUND
   SET v_finished = 1;

   TRUNCATE TABLE vorstperiodes;

   SET vVORIGESTATION = 0;
   SET vVOLGNR = 0;
   SET vVORIGEDATUM = STR_TO_DATE("1899-12-31", "%Y-%m-%d");
   SET v_firstrecord = 1;
   SET vTELLER = 0;

   OPEN C1;

  GET_VORSTPERIODES:
   LOOP
      FETCH C1 INTO vSTATION, vVANDAAG, vGISTEREN, vTG;

      IF v_finished = 1
      THEN
         LEAVE GET_VORSTPERIODES;
      END IF;

      IF (v_firstrecord = 1) OR ((vSTATION = vVORIGESTATION) AND (vGISTEREN = vVORIGEDATUM))
      THEN
         SET vTELLER = vTELLER + 1;
         SET vEINDE = vVANDAAG;
         SET vHELLMANN = vHELLMANN - vTG;
      ELSE
         IF (vTELLER >= 5) AND (vHELLMANN >= 16)
         THEN
            SET vVOLGNR = vVOLGNR + 1;

            INSERT INTO vorstperiodes(STATION, VOLGNR, BEGIN, EINDE, DAGEN, HELLMANN) VALUES (vVORIGESTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vHELLMANN);
         END IF;

         IF (vSTATION <> vVORIGESTATION) THEN 
           SET vVOLGNR = 0;
         END IF;

         SET vTELLER = 1;
         SET vBEGIN = vVANDAAG;
         SET vHELLMANN = -vTG;
         
      END IF;

      SET v_firstrecord = 0;
      SET vVORIGEDATUM = vVANDAAG;
      SET vVORIGESTATION = vSTATION;
      
   END LOOP GET_VORSTPERIODES;

   CLOSE C1;

   IF (vTELLER >= 5) AND (vHELLMANN >= 16)
   THEN
      SET vVOLGNR = vVOLGNR + 1;

      INSERT INTO vorstperiodes(STATION, VOLGNR, BEGIN, EINDE, DAGEN, HELLMANN) VALUES (vSTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vHELLMANN);
   END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Final view structure for view `v_uurgeg`
--

/*!50001 DROP VIEW IF EXISTS `v_uurgeg`*/;
/*!50001 CREATE VIEW `v_uurgeg` AS
  SELECT SYNC_KEY, STATION, JAAR, MAAND, DAG, UUR,
         DD, FH, FF, FX, T, T10, TD, SQ, Q, DR, RH, P,
         VV, N, U, WW, IX, M, R, S, O, Y
  FROM uurgeg */;

--
-- Final view structure for view `v_etmgeg`
--

/*!50001 DROP VIEW IF EXISTS `v_etmgeg`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_etmgeg` AS select `etmgeg`.`SYNC_KEY` AS `SYNC_KEY`,`etmgeg`.`STATION` AS `STATION`,`etmgeg`.`JAAR` AS `JAAR`,`etmgeg`.`MAAND` AS `MAAND`,`etmgeg`.`DAG` AS `DAG`,`etmgeg`.`DDVEC` AS `DDVEC`,`etmgeg`.`FHVEC` AS `FHVEC`,`etmgeg`.`FG` AS `FG`,`etmgeg`.`FHX` AS `FHX`,`etmgeg`.`FHXH` AS `FHXH`,`etmgeg`.`FHN` AS `FHN`,`etmgeg`.`FHNH` AS `FHNH`,`etmgeg`.`FXX` AS `FXX`,`etmgeg`.`FXXH` AS `FXXH`,`etmgeg`.`TG` AS `TG`,`etmgeg`.`TN` AS `TN`,`etmgeg`.`TNH` AS `TNH`,`etmgeg`.`TX` AS `TX`,`etmgeg`.`TXH` AS `TXH`,`etmgeg`.`T10N` AS `T10N`,`etmgeg`.`T10NH` AS `T10NH`,`etmgeg`.`SQ` AS `SQ`,`etmgeg`.`SP` AS `SP`,`etmgeg`.`Q` AS `Q`,`etmgeg`.`DR` AS `DR`,`etmgeg`.`RH` AS `RH`,`etmgeg`.`RHX` AS `RHX`,`etmgeg`.`RHXH` AS `RHXH`,`etmgeg`.`PG` AS `PG`,`etmgeg`.`PX` AS `PX`,`etmgeg`.`PXH` AS `PXH`,`etmgeg`.`PN` AS `PN`,`etmgeg`.`PNH` AS `PNH`,`etmgeg`.`VVN` AS `VVN`,`etmgeg`.`VVNH` AS `VVNH`,`etmgeg`.`VVX` AS `VVX`,`etmgeg`.`VVXH` AS `VVXH`,`etmgeg`.`NG` AS `NG`,`etmgeg`.`UG` AS `UG`,`etmgeg`.`UX` AS `UX`,`etmgeg`.`UXH` AS `UXH`,`etmgeg`.`UN` AS `UN`,`etmgeg`.`UNH` AS `UNH`,`etmgeg`.`EV24` AS `EV24` from `etmgeg` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_daily`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_daily`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_daily` AS select `eg`.`STATION` AS `sc_station`,`eg`.`JAAR` AS `sc_jaar`,`eg`.`MAAND` AS `sc_maand`,`eg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`eg`.`JAAR` AS `jaar`,`eg`.`MAAND` AS `maand`,`eg`.`DATUM` AS `datum`,`eg`.`TG` AS `tg`,`eg`.`TN` AS `tn`,`eg`.`TX` AS `tx`,`eg`.`PG` AS `pg`,`eg`.`SQ` AS `sq`,`eg`.`Q` AS `q`,`eg`.`RH` AS `rh` from (`etmgeg` `eg` join `stations` `st` on((`st`.`CODE` = `eg`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_main_daily`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_daily`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_main_daily` AS select `eg`.`STATION` AS `sc_station`,`eg`.`JAAR` AS `sc_jaar`,`eg`.`MAAND` AS `sc_maand`,`eg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`eg`.`JAAR` AS `jaar`,`eg`.`MAAND` AS `maand`,`eg`.`DATUM` AS `datum`,`eg`.`TG` AS `tg`,`eg`.`TN` AS `tn`,`eg`.`TX` AS `tx`,`eg`.`PG` AS `pg`,`eg`.`SQ` AS `sq`,`eg`.`Q` AS `q`,`eg`.`RH` AS `rh` from (`etmgeg` `eg` join `stations` `st` on((`st`.`CODE` = `eg`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_main_decade`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_decade`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_main_decade` AS select `dg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`dg`.`JAAR` AS `jaar`,`dg`.`MAAND` AS `maand`,`dg`.`DECADE` AS `decade`,`dg`.`TG` AS `tg`,`dg`.`TN` AS `tn`,`dg`.`TN_AVG` AS `tn_avg`,`dg`.`TX` AS `tx`,`dg`.`TX_AVG` AS `tx_avg`,`dg`.`PG` AS `pg`,`dg`.`SQ` AS `sq`,`dg`.`Q` AS `q`,`dg`.`RH` AS `rh` from (`decadegegevens` `dg` join `stations` `st` on((`st`.`CODE` = `dg`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_main_hourly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_hourly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_main_hourly` AS select `ug`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`ug`.`JAAR` AS `jaar`,`ug`.`MAAND` AS `maand`,`ug`.`DECADE` AS `decade`,`ug`.`DAG` AS `dag`,`ug`.`UUR` AS `uur`,`ug`.`DATUM_TIJD_VAN` AS `datum_tijd_van`,`ug`.`DATUM_TIJD_TOT` AS `datum_tijd_tot`,`ug`.`T` AS `t`,`ug`.`TD` AS `td`,`ug`.`FH` AS `fh`,`ug`.`P` AS `p`,`ug`.`SQ` AS `sq`,`ug`.`RH` AS `rh`,`ug`.`U` AS `u` from (`uurgeg` `ug` join `stations` `st` on((`st`.`CODE` = `ug`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_main_monthly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_monthly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_main_monthly` AS select `mg`.`STATION` AS `sc_station`,`mg`.`JAAR` AS `sc_jaar`,`mg`.`MAAND` AS `sc_maand`,`mg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`mg`.`JAAR` AS `jaar`,`mg`.`MAAND` AS `maand`,((`mg`.`JAAR` * 100) + `mg`.`MAAND`) AS `maandnummer`,`mg`.`TG` AS `tg`,`mg`.`TN` AS `tn`,`mg`.`TN_AVG` AS `tn_avg`,`mg`.`TX` AS `tx`,`mg`.`TX_AVG` AS `tx_avg`,`mg`.`PG` AS `pg`,`mg`.`SQ` AS `sq`,`mg`.`Q` AS `q`,`mg`.`RH` AS `rh` from (`maandgegevens` `mg` join `stations` `st` on((`mg`.`STATION` = `st`.`CODE`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_main_seizoen`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_seizoen`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_main_seizoen` AS select `sg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`sg`.`JAAR` AS `jaar`,`sg`.`SEIZOEN` AS `seizoen`,`sg`.`TG` AS `tg`,`sg`.`TN` AS `tn`,`sg`.`TN_AVG` AS `tn_avg`,`sg`.`TX` AS `tx`,`sg`.`TX_AVG` AS `tx_avg`,`sg`.`PG` AS `pg`,`sg`.`SQ` AS `sq`,`sg`.`Q` AS `q`,`sg`.`RH` AS `rh` from (`seizoensgegevens` `sg` join `stations` `st` on((`st`.`CODE` = `sg`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_main_yearly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_main_yearly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_main_yearly` AS select `jg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`jg`.`JAAR` AS `jaar`,`jg`.`TG` AS `tg`,`jg`.`TN` AS `tn`,`jg`.`TN_AVG` AS `tn_avg`,`jg`.`TX` AS `tx`,`jg`.`TX_AVG` AS `tx_avg`,`jg`.`PG` AS `pg`,`jg`.`SQ` AS `sq`,`jg`.`Q` AS `q`,`jg`.`RH` AS `rh` from (`jaargegevens` `jg` join `stations` `st` on((`st`.`CODE` = `jg`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_monthly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_monthly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_monthly` AS select `mg`.`STATION` AS `sc_station`,`mg`.`JAAR` AS `sc_jaar`,`mg`.`MAAND` AS `sc_maand`,`mg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`mg`.`JAAR` AS `jaar`,`mg`.`MAAND` AS `maand`,((`mg`.`JAAR` * 100) + `mg`.`MAAND`) AS `maandnummer`,`mg`.`TG` AS `tg`,`mg`.`TN` AS `tn`,`mg`.`TX` AS `tx`,`mg`.`PG` AS `pg`,`mg`.`SQ` AS `sq`,`mg`.`Q` AS `q`,`mg`.`RH` AS `rh` from (`maandgegevens` `mg` join `stations` `st` on((`mg`.`STATION` = `st`.`CODE`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_pres_daily`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_daily`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_pres_daily` AS select `eg`.`STATION` AS `sc_station`,`eg`.`JAAR` AS `sc_jaar`,`eg`.`MAAND` AS `sc_maand`,`eg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`eg`.`JAAR` AS `jaar`,`eg`.`MAAND` AS `maand`,`eg`.`DATUM` AS `datum`,`eg`.`PG` AS `pg`,`eg`.`PN` AS `pn`,`eg`.`PX` AS `px`,`dn`.`PG` AS `pg_norm` from ((`etmgeg` `eg` join `stations` `st` on((`st`.`CODE` = `eg`.`STATION`))) left join `dagnormen` `dn` on(((`dn`.`DECENNIUM` = 2020) and (`dn`.`STATION` = `eg`.`STATION`) and (`dn`.`MAAND` = `eg`.`MAAND`) and (`dn`.`DAG` = `eg`.`DAG`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_pres_decade`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_decade`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_pres_decade` AS select `dg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`dg`.`JAAR` AS `jaar`,`dg`.`MAAND` AS `maand`,`dg`.`DECADE` AS `decade`,`dg`.`PG` AS `pg`,`dn`.`PG` AS `pg_norm` from ((`decadegegevens` `dg` join `stations` `st` on((`st`.`CODE` = `dg`.`STATION`))) left join `decadenormen` `dn` on(((`dn`.`DECENNIUM` = 2020) and (`dn`.`STATION` = `dg`.`STATION`) and (`dn`.`MAAND` = `dg`.`MAAND`) and (`dn`.`DECADE` = `dg`.`DECADE`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_pres_hourly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_hourly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_pres_hourly` AS select `ug`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`ug`.`JAAR` AS `jaar`,`ug`.`MAAND` AS `maand`,`ug`.`DECADE` AS `decade`,`ug`.`DAG` AS `dag`,`ug`.`UUR` AS `uur`,`ug`.`DATUM_TIJD_VAN` AS `datum_tijd_van`,`ug`.`DATUM_TIJD_TOT` AS `datum_tijd_tot`,`ug`.`P` AS `p` from (`uurgeg` `ug` join `stations` `st` on((`st`.`CODE` = `ug`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_pres_monthly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_monthly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_pres_monthly` AS select `mg`.`STATION` AS `sc_station`,`mg`.`JAAR` AS `sc_jaar`,`mg`.`MAAND` AS `sc_maand`,`mg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`mg`.`JAAR` AS `jaar`,`mg`.`MAAND` AS `maand`,((`mg`.`JAAR` * 100) + `mg`.`MAAND`) AS `maandnummer`,`mg`.`PG` AS `pg`,`mn`.`PG` AS `pg_norm` from ((`maandgegevens` `mg` join `stations` `st` on((`mg`.`STATION` = `st`.`CODE`))) left join `maandnormen` `mn` on(((`mn`.`DECENNIUM` = 2020) and (`mn`.`STATION` = `mg`.`STATION`) and (`mn`.`MAAND` = `mg`.`MAAND`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_pres_seizoen`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_seizoen`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_pres_seizoen` AS select `sg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`sg`.`JAAR` AS `jaar`,`sg`.`SEIZOEN` AS `seizoen`,`sg`.`PG` AS `pg`,`sn`.`PG` AS `pg_norm` from ((`seizoensgegevens` `sg` join `stations` `st` on((`st`.`CODE` = `sg`.`STATION`))) left join `seizoensnormen` `sn` on(((`sn`.`DECENNIUM` = 2020) and (`sn`.`STATION` = `sg`.`STATION`) and (`sn`.`SEIZOEN` = `sg`.`SEIZOEN`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_pres_yearly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_pres_yearly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_pres_yearly` AS select `jg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`jg`.`JAAR` AS `jaar`,`jg`.`PG` AS `pg`,`jn`.`PG` AS `pg_norm` from ((`jaargegevens` `jg` join `stations` `st` on((`st`.`CODE` = `jg`.`STATION`))) left join `jaarnormen` `jn` on(((`jn`.`DECENNIUM` = 2020) and (`jn`.`STATION` = `jg`.`STATION`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_rain_daily`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_daily`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_rain_daily` AS select `eg`.`STATION` AS `sc_station`,`eg`.`JAAR` AS `sc_jaar`,`eg`.`MAAND` AS `sc_maand`,`eg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`eg`.`JAAR` AS `jaar`,`eg`.`MAAND` AS `maand`,`eg`.`DATUM` AS `datum`,`eg`.`RH` AS `rh`,`dn`.`RH` AS `rh_norm` from ((`etmgeg` `eg` join `stations` `st` on((`st`.`CODE` = `eg`.`STATION`))) left join `dagnormen` `dn` on(((`dn`.`DECENNIUM` = 2020) and (`dn`.`STATION` = `eg`.`STATION`) and (`dn`.`MAAND` = `eg`.`MAAND`) and (`dn`.`DAG` = `eg`.`DAG`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_rain_decade`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_decade`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_rain_decade` AS select `dg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`dg`.`JAAR` AS `jaar`,`dg`.`MAAND` AS `maand`,`dg`.`DECADE` AS `decade`,`dg`.`RH` AS `rh`,`dn`.`RH` AS `rh_norm` from ((`decadegegevens` `dg` join `stations` `st` on((`st`.`CODE` = `dg`.`STATION`))) left join `decadenormen` `dn` on(((`dn`.`DECENNIUM` = 2020) and (`dn`.`STATION` = `dg`.`STATION`) and (`dn`.`MAAND` = `dg`.`MAAND`) and (`dn`.`DECADE` = `dg`.`DECADE`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_rain_hourly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_hourly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_rain_hourly` AS select `ug`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`ug`.`JAAR` AS `jaar`,`ug`.`MAAND` AS `maand`,`ug`.`DECADE` AS `decade`,`ug`.`DAG` AS `dag`,`ug`.`UUR` AS `uur`,`ug`.`DATUM_TIJD_VAN` AS `datum_tijd_van`,`ug`.`DATUM_TIJD_TOT` AS `datum_tijd_tot`,`ug`.`RH` AS `rh`,`ug`.`DR` AS `dr` from (`uurgeg` `ug` join `stations` `st` on((`st`.`CODE` = `ug`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_rain_monthly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_monthly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_rain_monthly` AS select `mg`.`STATION` AS `sc_station`,`mg`.`JAAR` AS `sc_jaar`,`mg`.`MAAND` AS `sc_maand`,`mg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`mg`.`JAAR` AS `jaar`,`mg`.`MAAND` AS `maand`,((`mg`.`JAAR` * 100) + `mg`.`MAAND`) AS `maandnummer`,`mg`.`RH` AS `rh`,`mn`.`RH` AS `rh_norm` from ((`maandgegevens` `mg` join `stations` `st` on((`mg`.`STATION` = `st`.`CODE`))) left join `maandnormen` `mn` on(((`mn`.`DECENNIUM` = 2020) and (`mn`.`STATION` = `mg`.`STATION`) and (`mn`.`MAAND` = `mg`.`MAAND`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_rain_seizoen`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_seizoen`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_rain_seizoen` AS select `sg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`sg`.`JAAR` AS `jaar`,`sg`.`SEIZOEN` AS `seizoen`,`sg`.`RH` AS `rh`,`sn`.`RH` AS `rh_norm` from ((`seizoensgegevens` `sg` join `stations` `st` on((`st`.`CODE` = `sg`.`STATION`))) left join `seizoensnormen` `sn` on(((`sn`.`DECENNIUM` = 2020) and (`sn`.`STATION` = `sg`.`STATION`) and (`sn`.`SEIZOEN` = `sg`.`SEIZOEN`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_rain_yearly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_rain_yearly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_rain_yearly` AS select `jg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`jg`.`JAAR` AS `jaar`,`jg`.`RH` AS `rh`,`jn`.`RH` AS `rh_norm` from ((`jaargegevens` `jg` join `stations` `st` on((`st`.`CODE` = `jg`.`STATION`))) left join `jaarnormen` `jn` on(((`jn`.`DECENNIUM` = 2020) and (`jn`.`STATION` = `jg`.`STATION`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_sun_daily`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_daily`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_sun_daily` AS select `eg`.`STATION` AS `sc_station`,`eg`.`JAAR` AS `sc_jaar`,`eg`.`MAAND` AS `sc_maand`,`eg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`eg`.`JAAR` AS `jaar`,`eg`.`MAAND` AS `maand`,`eg`.`DATUM` AS `datum`,`eg`.`SQ` AS `sq`,`dn`.`SQ` AS `sq_norm`,`eg`.`Q` AS `q`,`dn`.`Q` AS `q_norm` from ((`etmgeg` `eg` join `stations` `st` on((`st`.`CODE` = `eg`.`STATION`))) left join `dagnormen` `dn` on(((`dn`.`DECENNIUM` = 2020) and (`dn`.`STATION` = `eg`.`STATION`) and (`dn`.`MAAND` = `eg`.`MAAND`) and (`dn`.`DAG` = `eg`.`DAG`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_sun_decade`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_decade`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_sun_decade` AS select `dg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`dg`.`JAAR` AS `jaar`,`dg`.`MAAND` AS `maand`,`dg`.`DECADE` AS `decade`,`dg`.`SQ` AS `sq`,`dn`.`SQ` AS `sq_norm`,`dg`.`Q` AS `q`,`dn`.`Q` AS `q_norm` from ((`decadegegevens` `dg` join `stations` `st` on((`st`.`CODE` = `dg`.`STATION`))) left join `decadenormen` `dn` on(((`dn`.`DECENNIUM` = 2020) and (`dn`.`STATION` = `dg`.`STATION`) and (`dn`.`MAAND` = `dg`.`MAAND`) and (`dn`.`DECADE` = `dg`.`DECADE`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_sun_hourly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_hourly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_sun_hourly` AS select `ug`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`ug`.`JAAR` AS `jaar`,`ug`.`MAAND` AS `maand`,`ug`.`DECADE` AS `decade`,`ug`.`DAG` AS `dag`,`ug`.`UUR` AS `uur`,`ug`.`DATUM_TIJD_VAN` AS `datum_tijd_van`,`ug`.`DATUM_TIJD_TOT` AS `datum_tijd_tot`,`ug`.`SQ` AS `sq`,`ug`.`Q` AS `q` from (`uurgeg` `ug` join `stations` `st` on((`st`.`CODE` = `ug`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_sun_monthly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_monthly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_sun_monthly` AS select `mg`.`STATION` AS `sc_station`,`mg`.`JAAR` AS `sc_jaar`,`mg`.`MAAND` AS `sc_maand`,`mg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`mg`.`JAAR` AS `jaar`,`mg`.`MAAND` AS `maand`,((`mg`.`JAAR` * 100) + `mg`.`MAAND`) AS `maandnummer`,`mg`.`SQ` AS `sq`,`mn`.`SQ` AS `sq_norm`,`mg`.`Q` AS `q`,`mn`.`Q` AS `q_norm` from ((`maandgegevens` `mg` join `stations` `st` on((`mg`.`STATION` = `st`.`CODE`))) left join `maandnormen` `mn` on(((`mn`.`DECENNIUM` = 2020) and (`mn`.`STATION` = `mg`.`STATION`) and (`mn`.`MAAND` = `mg`.`MAAND`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_sun_seizoen`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_seizoen`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_sun_seizoen` AS select `sg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`sg`.`JAAR` AS `jaar`,`sg`.`SEIZOEN` AS `seizoen`,`sg`.`SQ` AS `sq`,`sn`.`SQ` AS `sq_norm`,`sg`.`Q` AS `q`,`sn`.`Q` AS `q_norm` from ((`seizoensgegevens` `sg` join `stations` `st` on((`st`.`CODE` = `sg`.`STATION`))) left join `seizoensnormen` `sn` on(((`sn`.`DECENNIUM` = 2020) and (`sn`.`STATION` = `sg`.`STATION`) and (`sn`.`SEIZOEN` = `sg`.`SEIZOEN`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_sun_yearly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_sun_yearly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_sun_yearly` AS select `jg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`jg`.`JAAR` AS `jaar`,`jg`.`SQ` AS `sq`,`jn`.`SQ` AS `sq_norm`,`jg`.`Q` AS `q`,`jn`.`Q` AS `q_norm` from ((`jaargegevens` `jg` join `stations` `st` on((`st`.`CODE` = `jg`.`STATION`))) left join `jaarnormen` `jn` on(((`jn`.`DECENNIUM` = 2020) and (`jn`.`STATION` = `jg`.`STATION`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_temp_daily`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_daily`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_temp_daily` AS select `eg`.`STATION` AS `sc_station`,`eg`.`JAAR` AS `sc_jaar`,`eg`.`MAAND` AS `sc_maand`,`eg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`eg`.`JAAR` AS `jaar`,`eg`.`MAAND` AS `maand`,`eg`.`DATUM` AS `datum`,`eg`.`TG` AS `tg`,`dn`.`TG` AS `tg_norm`,`eg`.`TN` AS `tn`,`dn`.`TN` AS `tn_norm`,`eg`.`TX` AS `tx`,`dn`.`TX` AS `tx_norm` from ((`etmgeg` `eg` join `stations` `st` on((`st`.`CODE` = `eg`.`STATION`))) left join `dagnormen` `dn` on(((`dn`.`DECENNIUM` = 2020) and (`dn`.`STATION` = `eg`.`STATION`) and (`dn`.`MAAND` = `eg`.`MAAND`) and (`dn`.`DAG` = `eg`.`DAG`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_temp_decade`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_decade`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_temp_decade` AS select `dg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`dg`.`JAAR` AS `jaar`,`dg`.`MAAND` AS `maand`,`dg`.`DECADE` AS `decade`,`dg`.`TG` AS `tg`,`dn`.`TG` AS `tg_norm`,`dg`.`TN` AS `tn`,`dg`.`TN_AVG` AS `tn_avg`,`dn`.`TN` AS `tn_norm`,`dg`.`TX` AS `tx`,`dg`.`TX_AVG` AS `tx_avg`,`dn`.`TX` AS `tx_norm` from ((`decadegegevens` `dg` join `stations` `st` on((`st`.`CODE` = `dg`.`STATION`))) left join `decadenormen` `dn` on(((`dn`.`DECENNIUM` = 2020) and (`dn`.`STATION` = `dg`.`STATION`) and (`dn`.`MAAND` = `dg`.`MAAND`) and (`dn`.`DECADE` = `dg`.`DECADE`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_temp_hourly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_hourly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_temp_hourly` AS select `ug`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`ug`.`JAAR` AS `jaar`,`ug`.`MAAND` AS `maand`,`ug`.`DECADE` AS `decade`,`ug`.`DAG` AS `dag`,`ug`.`UUR` AS `uur`,`ug`.`DATUM_TIJD_VAN` AS `datum_tijd_van`,`ug`.`DATUM_TIJD_TOT` AS `datum_tijd_tot`,`ug`.`T` AS `t`,`ug`.`T10` AS `t10`,`ug`.`TD` AS `td`,`ug`.`U` AS `u` from (`uurgeg` `ug` join `stations` `st` on((`st`.`CODE` = `ug`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_temp_monthly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_monthly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_temp_monthly` AS select `mg`.`STATION` AS `sc_station`,`mg`.`JAAR` AS `sc_jaar`,`mg`.`MAAND` AS `sc_maand`,`mg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`mg`.`JAAR` AS `jaar`,`mg`.`MAAND` AS `maand`,((`mg`.`JAAR` * 100) + `mg`.`MAAND`) AS `maandnummer`,`mg`.`TG` AS `tg`,`mn`.`TG` AS `tg_norm`,`mg`.`TN` AS `tn`,`mg`.`TN_AVG` AS `tn_avg`,`mn`.`TN` AS `tn_norm`,`mg`.`TX` AS `tx`,`mg`.`TX_AVG` AS `tx_avg`,`mn`.`TX` AS `tx_norm` from ((`maandgegevens` `mg` join `stations` `st` on((`mg`.`STATION` = `st`.`CODE`))) left join `maandnormen` `mn` on(((`mn`.`DECENNIUM` = 2020) and (`mn`.`STATION` = `mg`.`STATION`) and (`mn`.`MAAND` = `mg`.`MAAND`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_temp_seizoen`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_seizoen`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_temp_seizoen` AS select `sg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`sg`.`JAAR` AS `jaar`,`sg`.`SEIZOEN` AS `seizoen`,`sg`.`TG` AS `tg`,`sn`.`TG` AS `tg_norm`,`sg`.`TN` AS `tn`,`sg`.`TN_AVG` AS `tn_avg`,`sn`.`TN` AS `tn_norm`,`sg`.`TX` AS `tx`,`sg`.`TX_AVG` AS `tx_avg`,`sn`.`TX` AS `tx_norm` from ((`seizoensgegevens` `sg` join `stations` `st` on((`st`.`CODE` = `sg`.`STATION`))) left join `seizoensnormen` `sn` on(((`sn`.`DECENNIUM` = 2020) and (`sn`.`STATION` = `sg`.`STATION`) and (`sn`.`SEIZOEN` = `sg`.`SEIZOEN`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_temp_yearly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_temp_yearly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_temp_yearly` AS select `jg`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`jg`.`JAAR` AS `jaar`,`jg`.`TG` AS `tg`,`jn`.`TG` AS `tg_norm`,`jg`.`TN` AS `tn`,`jg`.`TN_AVG` AS `tn_avg`,`jn`.`TN` AS `tn_norm`,`jg`.`TX` AS `tx`,`jg`.`TX_AVG` AS `tx_avg`,`jn`.`TX` AS `tx_norm` from ((`jaargegevens` `jg` join `stations` `st` on((`st`.`CODE` = `jg`.`STATION`))) left join `jaarnormen` `jn` on(((`jn`.`DECENNIUM` = 2020) and (`jn`.`STATION` = `jg`.`STATION`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_knmidata_wind_hourly`
--

/*!50001 DROP VIEW IF EXISTS `v_knmidata_wind_hourly`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_knmidata_wind_hourly` AS select `ug`.`STATION` AS `stationsCode`,`st`.`OMSCHRIJVING` AS `station`,`ug`.`JAAR` AS `jaar`,`ug`.`MAAND` AS `maand`,`ug`.`DECADE` AS `decade`,`ug`.`DAG` AS `dag`,`ug`.`UUR` AS `uur`,`ug`.`DATUM_TIJD_VAN` AS `datum_tijd_van`,`ug`.`DATUM_TIJD_TOT` AS `datum_tijd_tot`,`ug`.`FH` AS `fh`,`ug`.`FF` AS `ff`,`ug`.`FX` AS `fx` from (`uurgeg` `ug` join `stations` `st` on((`st`.`CODE` = `ug`.`STATION`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_neerslaggeg`
--

/*!50001 DROP VIEW IF EXISTS `v_neerslaggeg`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_neerslaggeg` AS select `neerslaggeg`.`SYNC_KEY` AS `SYNC_KEY`,`neerslaggeg`.`STATION` AS `STATION`,`neerslaggeg`.`JAAR` AS `JAAR`,`neerslaggeg`.`MAAND` AS `MAAND`,`neerslaggeg`.`DAG` AS `DAG`,`neerslaggeg`.`RD` AS `RD`,`neerslaggeg`.`SX` AS `SX` from `neerslaggeg` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_solaredge_daily`
--
