'use strict';

// knmidata-v3.js — two-pointer merge sync (O(n+m))
// Exact insert/update/unchanged counts. No ON DUPLICATE KEY UPDATE.
// Requires views V_ETMGEG, V_UURGEG, V_NEERSLAGGEG in the bbqweer database.

const https  = require('https');
const axios  = require('axios').create({ httpsAgent: new https.Agent({ maxSockets: 5 }) });
const AdmZip = require('adm-zip');
const pool   = require('../helpers/mysqlpool-knmi.helper');
const { taskStart, taskProgress, taskFinish, taskError } = require('../helpers/server-tasks');

let running = false;
const db = pool.promise();
const BATCH_SIZE = 500;

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseNum(s)    { return s === '' ? null : parseInt(s, 10); }
function parseDiv10(s)  { return s === '' ? null : parseInt(s, 10) / 10; }
function parseSQ(s)     { if (s === '') return null; const n = parseInt(s, 10); return n === -1 ? 0 : n / 10; }
function parseRH(s)     { if (s === '') return null; const n = parseInt(s, 10); return n === -1 ? 0 : n / 10; }
function parseCSV(line) { return line.split(',').map(s => s.trim()); }

// ─── ISO week / derived fields ────────────────────────────────────────────────

function getISOWeek(year, month, day) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDerived(jaar, maand, dag) {
    const week        = getISOWeek(jaar, maand, dag);
    let   jaarWeek    = jaar;
    if (week > 50 && maand === 1)      jaarWeek = jaar - 1;
    else if (week < 5 && maand === 12) jaarWeek = jaar + 1;
    const seizoen     = maand <= 2 ? 'W' : maand <= 5 ? 'L' : maand <= 8 ? 'Z' : maand <= 11 ? 'H' : 'W';
    const jaarSeizoen = maand === 12 ? jaar + 1 : jaar;
    const winter      = maand >= 11 ? jaar + 1 : maand <= 3 ? jaar : 0;
    const decade      = dag <= 10 ? 1 : dag <= 20 ? 2 : 3;
    const datum       = `${jaar}-${String(maand).padStart(2, '0')}-${String(dag).padStart(2, '0')}`;
    return { week, jaarWeek, seizoen, jaarSeizoen, winter, decade, datum };
}

// ─── Value comparison (null-safe, handles DB decimal strings vs JS numbers) ───

function eqVal(a, b) {
    const na = (a === null || a === undefined);
    const nb = (b === null || b === undefined);
    if (na && nb) return true;
    if (na || nb) return false;
    return Number(a) === Number(b);
}

function rowsEqual(dataVals, dataNames, dbRow) {
    for (let k = 0; k < dataNames.length; k++) {
        if (!eqVal(dataVals[k], dbRow[dataNames[k]])) return false;
    }
    return true;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

async function logMsg(msg) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[knmidata-v3] ${ts} - ${msg}`);
    try { await db.execute('INSERT INTO logfile (datum, logtext) VALUES (NOW(), ?)', [msg.slice(0, 255)]); }
    catch (e) { console.error('[knmidata-v3] logfile insert error:', e.message); }
}

// ─── Station extraction ───────────────────────────────────────────────────────

function extractStation(csvText) {
    let inData = false;
    for (const line of csvText.split('\n')) {
        if (!inData) { if (line.includes('STN,YYYYMMDD')) inData = true; continue; }
        const t = line.trim();
        if (!t || t.length <= 15) continue;
        return parseInt(t.split(',')[0].trim(), 10);
    }
    return null;
}

// ─── Two-pointer merge ────────────────────────────────────────────────────────

async function mergeSync(rowsA, rowsB, insertSql, updateSql) {
    let i = 0, j = 0;
    let updated = 0, unchanged = 0;
    const toInsert = [];

    while (i < rowsA.length && j < rowsB.length) {
        const a = rowsA[i];
        const b = rowsB[j];

        if (a.key < b.SYNC_KEY) {
            toInsert.push(a.insertRow);
            i++;
        } else if (a.key === b.SYNC_KEY) {
            if (!rowsEqual(a.dataVals, a.dataNames, b)) {
                await db.execute(updateSql, [...a.dataVals, ...a.keyVals]);
                updated++;
            } else {
                unchanged++;
            }
            i++; j++;
        } else {
            j++;
        }
    }

    while (i < rowsA.length) { toInsert.push(rowsA[i].insertRow); i++; }

    for (let s = 0; s < toInsert.length; s += BATCH_SIZE) {
        await db.query(insertSql, [toInsert.slice(s, s + BATCH_SIZE)]);
    }

    return { inserted: toInsert.length, updated, unchanged };
}

// ─── ETMGEG ───────────────────────────────────────────────────────────────────

const ETMGEG_NAMES = [
    'DDVEC','FHVEC','FG','FHX','FHXH','FHN','FHNH','FXX','FXXH',
    'TG','TN','TNH','TX','TXH','T10N','T10NH',
    'SQ','SP','Q','DR','RH','RHX','RHXH',
    'PG','PX','PXH','PN','PNH',
    'VVN','VVNH','VVX','VVXH',
    'NG','UG','UX','UXH','UN','UNH','EV24',
];

const ETMGEG_INSERT = `
    INSERT INTO etmgeg
    (STATION,DECENNIUM,JAAR,MAAND,DAG,DATUM,WEEK,JAAR_WEEK,SEIZOEN,JAAR_SEIZOEN,WINTER,DECADE,
     DDVEC,FHVEC,FG,FHX,FHXH,FHN,FHNH,FXX,FXXH,TG,TN,TNH,TX,TXH,T10N,T10NH,
     SQ,SP,Q,DR,RH,RHX,RHXH,PG,PX,PXH,PN,PNH,VVN,VVNH,VVX,VVXH,NG,UG,UX,UXH,UN,UNH,EV24)
    VALUES ?`;

const ETMGEG_UPDATE = `
    UPDATE etmgeg SET
     DDVEC=?,FHVEC=?,FG=?,FHX=?,FHXH=?,FHN=?,FHNH=?,FXX=?,FXXH=?,
     TG=?,TN=?,TNH=?,TX=?,TXH=?,T10N=?,T10NH=?,
     SQ=?,SP=?,Q=?,DR=?,RH=?,RHX=?,RHXH=?,
     PG=?,PX=?,PXH=?,PN=?,PNH=?,
     VVN=?,VVNH=?,VVX=?,VVXH=?,
     NG=?,UG=?,UX=?,UXH=?,UN=?,UNH=?,EV24=?
    WHERE STATION=? AND JAAR=? AND MAAND=? AND DAG=?`;

function parseEtmgegRows(csvText) {
    const lines = csvText.split('\n');
    let started = false;
    const rows  = [];

    for (const line of lines) {
        if (!started) { if (line.includes('STN,YYYYMMDD')) started = true; continue; }
        const t = line.trim();
        if (!t || t.length <= 15) continue;
        const csv = parseCSV(t);
        if (csv.length < 41) continue;

        const station   = parseInt(csv[0], 10);
        const yyyymmdd  = csv[1];
        const jaar      = parseInt(yyyymmdd.slice(0, 4), 10);
        const maand     = parseInt(yyyymmdd.slice(4, 6), 10);
        const dag       = parseInt(yyyymmdd.slice(6, 8), 10);
        const { week, jaarWeek, seizoen, jaarSeizoen, winter, decade, datum } = getDerived(jaar, maand, dag);
        const decennium = Math.ceil(jaar / 10) * 10;

        const dataVals = [
            parseNum(csv[2]),    parseDiv10(csv[3]),  parseDiv10(csv[4]),  parseDiv10(csv[5]),
            parseNum(csv[6]),    parseDiv10(csv[7]),  parseNum(csv[8]),    parseDiv10(csv[9]),
            parseNum(csv[10]),   parseDiv10(csv[11]), parseDiv10(csv[12]), parseNum(csv[13]),
            parseDiv10(csv[14]), parseNum(csv[15]),   parseDiv10(csv[16]), parseNum(csv[17]),
            parseSQ(csv[18]),    parseNum(csv[19]),   parseNum(csv[20]),   parseDiv10(csv[21]),
            parseRH(csv[22]),    parseRH(csv[23]),    parseNum(csv[24]),   parseDiv10(csv[25]),
            parseDiv10(csv[26]), parseNum(csv[27]),   parseDiv10(csv[28]), parseNum(csv[29]),
            parseNum(csv[30]),   parseNum(csv[31]),   parseNum(csv[32]),   parseNum(csv[33]),
            parseNum(csv[34]),   parseNum(csv[35]),   parseNum(csv[36]),   parseNum(csv[37]),
            parseNum(csv[38]),   parseNum(csv[39]),   parseDiv10(csv[40]),
        ];

        rows.push({
            key:       String(station).padStart(3, '0') + yyyymmdd,
            keyVals:   [station, jaar, maand, dag],
            dataNames: ETMGEG_NAMES,
            dataVals,
            insertRow: [station, decennium, jaar, maand, dag, datum, week, jaarWeek, seizoen, jaarSeizoen, winter, decade, ...dataVals],
        });
    }
    return rows;
}

async function syncEtmgeg(station, csvText) {
    const rowsA = parseEtmgegRows(csvText);
    if (rowsA.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };
    const [rowsB] = await db.query(
        `SELECT SYNC_KEY, ${ETMGEG_NAMES.join(',')} FROM v_etmgeg WHERE STATION=? ORDER BY SYNC_KEY`,
        [station]
    );
    return mergeSync(rowsA, rowsB, ETMGEG_INSERT, ETMGEG_UPDATE);
}

// ─── UURGEG ───────────────────────────────────────────────────────────────────

const UURGEG_NAMES = [
    'DD','FH','FF','FX','T','T10','TD','SQ','Q','DR','RH','P',
    'VV','N','U','WW','IX','M','R','S','O','Y',
];

const UURGEG_INSERT = `
    INSERT INTO uurgeg
    (STATION,JAAR,MAAND,DAG,UUR,DATUM,DATUM_TIJD_VAN,DATUM_TIJD_TOT,WEEK,JAAR_WEEK,SEIZOEN,JAAR_SEIZOEN,WINTER,DECADE,
     DD,FH,FF,FX,T,T10,TD,SQ,Q,DR,RH,P,VV,N,U,WW,IX,M,R,S,O,Y)
    VALUES ?`;

const UURGEG_UPDATE = `
    UPDATE uurgeg SET
     DD=?,FH=?,FF=?,FX=?,T=?,T10=?,TD=?,SQ=?,Q=?,DR=?,RH=?,P=?,
     VV=?,N=?,U=?,WW=?,IX=?,M=?,R=?,S=?,O=?,Y=?
    WHERE STATION=? AND JAAR=? AND MAAND=? AND DAG=? AND UUR=?`;

function parseUurgegRows(csvText) {
    const lines = csvText.split('\n');
    let started = false;
    const rows  = [];

    for (const line of lines) {
        if (!started) { if (line.includes('STN,YYYYMMDD')) started = true; continue; }
        const t = line.trim();
        if (!t || t.length <= 15) continue;
        const csv = parseCSV(t);
        if (csv.length < 25) continue;

        const station  = parseInt(csv[0], 10);
        const yyyymmdd = csv[1];
        const jaar     = parseInt(yyyymmdd.slice(0, 4), 10);
        const maand    = parseInt(yyyymmdd.slice(4, 6), 10);
        const dag      = parseInt(yyyymmdd.slice(6, 8), 10);
        const uur      = parseInt(csv[2], 10);
        const { week, jaarWeek, seizoen, jaarSeizoen, winter, decade, datum } = getDerived(jaar, maand, dag);
        const vanMs         = Date.UTC(jaar, maand - 1, dag, uur - 1);
        const datumTijdVan  = new Date(vanMs).toISOString().slice(0, 19).replace('T', ' ');
        const datumTijdTot  = new Date(vanMs + 3600000).toISOString().slice(0, 19).replace('T', ' ');

        const dataVals = [
            parseNum(csv[3]),    parseDiv10(csv[4]),  parseDiv10(csv[5]),  parseDiv10(csv[6]),
            parseDiv10(csv[7]),  parseDiv10(csv[8]),  parseDiv10(csv[9]),  parseSQ(csv[10]),
            parseNum(csv[11]),   parseDiv10(csv[12]), parseRH(csv[13]),    parseDiv10(csv[14]),
            parseNum(csv[15]),   parseNum(csv[16]),   parseNum(csv[17]),   parseNum(csv[18]),
            parseNum(csv[19]),   parseNum(csv[20]),   parseNum(csv[21]),   parseNum(csv[22]),
            parseNum(csv[23]),   parseNum(csv[24]),
        ];

        rows.push({
            key:       String(station).padStart(3, '0') + yyyymmdd + String(uur).padStart(2, '0'),
            keyVals:   [station, jaar, maand, dag, uur],
            dataNames: UURGEG_NAMES,
            dataVals,
            insertRow: [station, jaar, maand, dag, uur, datum, datumTijdVan, datumTijdTot, week, jaarWeek, seizoen, jaarSeizoen, winter, decade, ...dataVals],
        });
    }
    return rows;
}

async function syncUurgeg(station, csvText) {
    const rowsA = parseUurgegRows(csvText);
    if (rowsA.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };
    const [rowsB] = await db.query(
        `SELECT SYNC_KEY, ${UURGEG_NAMES.join(',')} FROM v_uurgeg WHERE STATION=? ORDER BY SYNC_KEY`,
        [station]
    );
    return mergeSync(rowsA, rowsB, UURGEG_INSERT, UURGEG_UPDATE);
}

// ─── NEERSLAGGEG ──────────────────────────────────────────────────────────────

const NEERS_NAMES = ['RD', 'SX'];

const NEERS_INSERT = `
    INSERT INTO neerslaggeg
    (STATION,JAAR,MAAND,DAG,DATUM,WEEK,JAAR_WEEK,SEIZOEN,JAAR_SEIZOEN,WINTER,DECADE,RD,SX)
    VALUES ?`;

const NEERS_UPDATE = `
    UPDATE neerslaggeg SET RD=?, SX=?
    WHERE STATION=? AND JAAR=? AND MAAND=? AND DAG=?`;

function parseNeerslaggegRows(csvText) {
    const lines = csvText.split('\n');
    let started = false;
    const rows  = [];

    for (const line of lines) {
        if (!started) { if (line.includes('STN,YYYYMMDD')) started = true; continue; }
        const t = line.trim();
        if (!t || t.length <= 15) continue;
        const csv = parseCSV(t);
        if (csv.length < 4) continue;

        const station  = parseInt(csv[0], 10);
        const yyyymmdd = csv[1];
        const jaar     = parseInt(yyyymmdd.slice(0, 4), 10);
        const maand    = parseInt(yyyymmdd.slice(4, 6), 10);
        const dag      = parseInt(yyyymmdd.slice(6, 8), 10);
        const { week, jaarWeek, seizoen, jaarSeizoen, winter, decade, datum } = getDerived(jaar, maand, dag);

        const dataVals = [parseDiv10(csv[2]), parseNum(csv[3])];

        rows.push({
            key:       String(station).padStart(3, '0') + yyyymmdd,
            keyVals:   [station, jaar, maand, dag],
            dataNames: NEERS_NAMES,
            dataVals,
            insertRow: [station, jaar, maand, dag, datum, week, jaarWeek, seizoen, jaarSeizoen, winter, decade, ...dataVals],
        });
    }
    return rows;
}

async function syncNeerslaggeg(station, csvText) {
    const rowsA = parseNeerslaggegRows(csvText);
    if (rowsA.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };
    const [rowsB] = await db.query(
        `SELECT SYNC_KEY, ${NEERS_NAMES.join(',')} FROM v_neerslaggeg WHERE STATION=? ORDER BY SYNC_KEY`,
        [station]
    );
    return mergeSync(rowsA, rowsB, NEERS_INSERT, NEERS_UPDATE);
}

// ─── Process one DATAFILES row ────────────────────────────────────────────────

async function processFile(fileRow, fullSync = false) {
    const url      = fileRow.INTERNET_LINK;
    const filename = fileRow.FILENAME;
    const filetype = fileRow.FILETYPE;

    let zipBuffer;
    let downloadedBytes = 0;
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 });
        zipBuffer = Buffer.from(response.data);
        downloadedBytes = zipBuffer.length;
    } catch (e) {
        await logMsg(`ERROR downloading ${filename}: ${e.message}`);
        await taskError('knmidata-sync');
        return { error: true, bytes: 0 };
    }

    let entryDate = null, csvText = null;
    try {
        const zip   = new AdmZip(zipBuffer);
        const entry = zip.getEntry(filename);
        if (!entry) { await logMsg(`ERROR: ${filename} not found in ZIP`); await taskError('knmidata-sync'); return { error: true, bytes: downloadedBytes }; }
        entryDate = entry.header.time;
        csvText   = zip.readAsText(entry);
    } catch (e) {
        await logMsg(`ERROR reading ZIP for ${filename}: ${e.message}`);
        await taskError('knmidata-sync');
        return { error: true, bytes: downloadedBytes };
    }

    const entryDateStr = entryDate instanceof Date ? entryDate.toISOString().slice(0, 19).replace('T', ' ') : null;
    await db.execute('UPDATE datafiles SET DATE_LAST_CHECK=NOW(), NEW_FILEDATE=? WHERE FILENAME=?', [entryDateStr, filename]);

    const storedDateStr = fileRow.FILEDATE
        ? (fileRow.FILEDATE instanceof Date
            ? fileRow.FILEDATE.toISOString().slice(0, 19).replace('T', ' ')
            : String(fileRow.FILEDATE).slice(0, 19))
        : null;

    if (!fullSync && storedDateStr !== null && entryDateStr !== null && storedDateStr === entryDateStr) {
        console.log(`[knmidata-v3] SKIP ${filename} (date unchanged: ${entryDateStr})`);
        return { error: false, bytes: downloadedBytes };
    }

    const station = extractStation(csvText);
    if (!station) { await logMsg(`ERROR: could not determine station for ${filename}`); await taskError('knmidata-sync'); return { error: true, bytes: downloadedBytes }; }

    const lineCount = csvText.split('\n').length;
    let counts = { inserted: 0, updated: 0, unchanged: 0 };

    try {
        if      (filetype === 'E') counts = await syncEtmgeg(station, csvText);
        else if (filetype === 'U') counts = await syncUurgeg(station, csvText);
        else if (filetype === 'N') counts = await syncNeerslaggeg(station, csvText);
        else { await logMsg(`Unknown FILETYPE '${filetype}' for ${filename}`); await taskError('knmidata-sync'); return { error: true, bytes: downloadedBytes }; }
    } catch (e) {
        await logMsg(`ERROR processing ${filename}: ${e.message}`);
        await taskError('knmidata-sync');
        return { error: true, bytes: downloadedBytes };
    }

    const total = counts.inserted + counts.updated + counts.unchanged;
    await db.execute(
        'UPDATE datafiles SET FILEDATE=?, DATE_LAST_IMPORT=NOW(), LINECOUNT=?, RECORDS=? WHERE FILENAME=?',
        [entryDateStr, lineCount, total, filename]
    );

    await logMsg(`${filename} -> inserted=${counts.inserted} updated=${counts.updated} unchanged=${counts.unchanged}`);
    return { error: false, bytes: downloadedBytes };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function syncKnmiDataV3(fullSync = false) {
    if (running) { console.log('[knmidata-v3] Already running, skipping.'); return; }
    running = true;
    try {
        await logMsg(`Starting KNMI data sync (v3${fullSync ? ', FULL SYNC' : ''})...`);

        const [files] = await db.query('SELECT * FROM datafiles ORDER BY FILENAME');
        await taskStart('knmidata-sync', files.length);

        let progress = 0, errors = 0, totalBytes = 0;
        for (const fileRow of files) {
            const { error, bytes } = await processFile(fileRow, fullSync);
            if (error) errors++;
            totalBytes += bytes;
            await taskProgress('knmidata-sync', ++progress);
        }

        try {
            await db.query('CALL UpdateHistory()');
            await logMsg('UpdateHistory completed.');
        } catch (e) { await logMsg(`UpdateHistory error: ${e.message}`); }

        const mb = (totalBytes / 1024 / 1024).toFixed(1);
        await logMsg(`KNMI data sync v3 finished. Downloaded: ${mb} MB`);
        const status = errors > 0 ? 'partial' : 'success';
        await taskFinish('knmidata-sync', status, `Files: ${files.length}, Errors: ${errors}, Downloaded: ${mb} MB${fullSync ? ' (full sync)' : ''}`);
    } catch (e) {
        console.error('[knmidata-v3] Fatal error:', e);
        try { await logMsg(`Fatal error: ${e.message}`); } catch (_) {}
        await taskFinish('knmidata-sync', 'error', e.message);
    } finally {
        running = false;
    }
}

module.exports = syncKnmiDataV3;
