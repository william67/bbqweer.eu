-- New KNMI stations added 07-08-2026
-- Weather station 392 (Horst) + precipitation stations 92 (Hoornsterzwaag) and 485 (Simonshaven).
-- Table names lowercase: MySQL runs on Linux in Docker and is case-sensitive.

INSERT INTO stations (CODE, OMSCHRIJVING, import, metar, wmo)
VALUES (392, 'Horst', 0, NULL, NULL);

INSERT INTO datafiles (FILENAME, INTERNET_LINK, STATION, NEERSLAGSTATION, FILETYPE, ZIPFILE)
VALUES (
    'etmgeg_392.txt',
    'https://cdn.knmi.nl/knmi/map/page/klimatologie/gegevens/daggegevens/etmgeg_392.zip',
    392,
    NULL,
    'E',
    'etmgeg_392.zip'
);

INSERT INTO datafiles (FILENAME, INTERNET_LINK, STATION, NEERSLAGSTATION, FILETYPE, ZIPFILE)
VALUES (
    'uurgeg_392_2021-2030.txt',
    'https://cdn.knmi.nl/knmi/map/page/klimatologie/gegevens/uurgegevens/uurgeg_392_2021-2030.zip',
    392,
    NULL,
    'U',
    'uurgeg_392_2021-2030.zip'
);

INSERT INTO neerslagstations (CODE, OMSCHRIJVING, import)
VALUES
    (92,  'Hoornsterzwaag', 0),
    (485, 'Simonshaven',    0);

INSERT INTO datafiles (FILENAME, INTERNET_LINK, STATION, NEERSLAGSTATION, FILETYPE, ZIPFILE)
VALUES
    ('neerslaggeg_HOORNSTERZWAAG_092.txt', 'https://cdn.knmi.nl/knmi/map/page/klimatologie/gegevens/monv_reeksen/neerslaggeg_HOORNSTERZWAAG_092.zip', NULL, 92,  'N', 'neerslaggeg_HOORNSTERZWAAG_092.zip'),
    ('neerslaggeg_SIMONSHAVEN_485.txt',    'https://cdn.knmi.nl/knmi/map/page/klimatologie/gegevens/monv_reeksen/neerslaggeg_SIMONSHAVEN_485.zip',    NULL, 485, 'N', 'neerslaggeg_SIMONSHAVEN_485.zip');
