// Manual trigger for KNMI data sync
// Usage:
//   node callSyncKnmiData.js          — incremental sync (only changed files)
//   node callSyncKnmiData.js --full   — full sync (re-process all files)

process.on('uncaughtException', (err) => {
    console.error('[callSyncKnmiData] Uncaught Exception:', err);
    process.exit(1);
});

const fullSync = process.argv.includes('--full');

const syncKnmiDataV4 = require('./tasks/knmidata-v4');

console.log(`[callSyncKnmiData] Starting KNMI sync (fullSync=${fullSync})...`);

syncKnmiDataV4(fullSync)
    .then(() => { console.log('[callSyncKnmiData] Done.'); process.exit(0); })
    .catch(err => { console.error('[callSyncKnmiData] Error:', err); process.exit(1); });
