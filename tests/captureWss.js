'use strict';

process.env.NODE_PATH = require('path').resolve(__dirname, '../backend/node_modules');
require('module').Module._initPaths();

const WebSocket = require('ws');
const fs        = require('fs');

const HOURS    = parseFloat(process.argv[2] ?? '2');
const OUT_FILE = `wss_${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
const out      = fs.createWriteStream(OUT_FILE);
let   count    = 0;
const start    = Date.now();

const INIT_MSG = JSON.stringify({
    v: 24, i: {}, s: false, x: 0, w: 0, tx: 0, tw: 1, a: 4,
    z: 6, b: true, h: '', l: 1, t: 1,
    from_lightningmaps_org: true,
    p: [59.0, 30.0, 40.0, -12.0],
    r: 'A',
});

function connect(port) {
    const url = `wss://live2.lightningmaps.org:${port}/`;
    const ws  = new WebSocket(url, {
        rejectUnauthorized: false,
        headers: {
            'Origin':     'https://www.lightningmaps.org',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        },
    });

    ws.on('open', () => {
        console.log(`Connected: ${url}`);
        ws.send(INIT_MSG);
    });

    ws.on('message', (data) => {
        const raw = data.toString();
        try {
            const msg = JSON.parse(raw);
            if ('k' in msg) ws.send(`{"k": ${(msg.k * 3604) % 7081 * Date.now() / 100}}`);
            if ('port' in msg) port = parseInt(msg.port, 10) || port;
            if ('reload' in msg) {
                ws.removeAllListeners('close');
                ws.close();
                setTimeout(() => connect(port), parseInt(msg.reload, 10) || 30_000);
                return;
            }
            if (msg.strokes && msg.strokes.length) {
                out.write(raw + '\n');
                count += msg.strokes.length;
                process.stdout.write(`\r${Math.round((Date.now()-start)/1000)}s — ${count} strokes`);
            }
        } catch {}
    });

    ws.on('close', () => {
        console.log('\nDisconnected, reconnecting in 5s...');
        setTimeout(() => connect(443), 5000);
    });

    ws.on('error', () => {});
}

console.log(`Capturing WSS stream to ${OUT_FILE} for ${HOURS}h...`);
connect(443);

setTimeout(() => {
    out.end(() => {
        console.log(`\nDone. ${count} strokes written to ${OUT_FILE}`);
        process.exit(0);
    });
}, HOURS * 60 * 60 * 1000);
