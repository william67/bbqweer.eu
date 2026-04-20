// Manual trigger for KNMI data sync
// Usage:
//   node callSyncKnmi.js          — incremental sync (only changed files)
//   node callSyncKnmi.js --full   — full sync (re-process all files)

process.on('uncaughtException', (err) => {
    console.error('[callSyncKnmi] Uncaught Exception:', err);
    process.exit(1);
});

const fullSync = process.argv.includes('--full');

const syncKnmiDataV3 = require('./tasks/knmidata-v3');

console.log(`[callSyncKnmi] Starting KNMI sync (fullSync=${fullSync})...`);

syncKnmiDataV3(fullSync)
    .then(() => { console.log('[callSyncKnmi] Done.'); process.exit(0); })
    .catch(err => { console.error('[callSyncKnmi] Error:', err); process.exit(1); });
