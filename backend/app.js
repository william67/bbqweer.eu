process.on('uncaughtException', (err) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err);
});

const express    = require('express');
const http       = require('http');
const path       = require('path');
const cors       = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const { initBlitzortung, initSocketBlitzortung } = require('./socket/blitzortung');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
const port   = 3000;

app.use(cors());
app.use(compression());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// Serve Angular dist — nginx handles this in production, but useful for local dev
const staticPath = path.join(__dirname, 'frontend');
app.use(express.static(staticPath, {
    setHeaders: (res, filePath) => {
        if (/\.(js|css|woff2?|ttf|eot|svg|png|ico)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

const knmiReportsRouter  = require('./routes/knmi-reports.route');
const starsRouter        = require('./routes/stars.route');
const satellitesRouter   = require('./routes/satellites.route');
const authRouter         = require('./routes/auth.route');
const usersRouter        = require('./routes/users.route');
const serverTasksRouter  = require('./routes/server-tasks.route');
const energieRouter      = require('./routes/energy-prices.route');
const solarRouter        = require('./routes/solar.route');
const fileAreasRouter    = require('./routes/file-areas.route');
const strikeAreasRouter  = require('./routes/strike-areas.route');
const tomtomRouter       = require('./routes/tomtom.route');
const ntfyRouter         = require('./routes/ntfy.route');

app.use('/api/knmi-reports',  knmiReportsRouter);
app.use('/api/stars',         starsRouter);
app.use('/api/satellites',    satellitesRouter);
app.use('/api/auth',          authRouter);
app.use('/api/users',         usersRouter);
app.use('/api/server-tasks',  serverTasksRouter);
app.use('/api/energie',       energieRouter);
app.use('/api/solar',         solarRouter);
app.use('/api/file-areas',    fileAreasRouter);
app.use('/api/strike-areas',  strikeAreasRouter);
app.use('/api/tomtom',        tomtomRouter);
app.use('/api/ntfy',          ntfyRouter);

server.listen(port, () => console.log(`bbqweer backend listening on port ${port}`));

io.on('connection', socket => initSocketBlitzortung(socket));
initBlitzortung(io);

// Cron tasks — skipped in local dev (config.local.ini present)
const fs = require('fs');
if (!fs.existsSync('config.local.ini')) {
    const cron           = require('node-cron');
    const knmiDataSync   = require('./tasks/knmidata-v4');
    const satellitesSync = require('./tasks/satellites-sync');
    const energieSync    = require('./tasks/energy-prices-sync');

    cron.schedule('0 * * * *', () => {
        knmiDataSync().catch(err => console.error('knmidata-v3 cron error:', err));
    });

    cron.schedule('30 * * * *', () => {
        satellitesSync().catch(err => console.error('satellites-sync cron error:', err));
    });

    cron.schedule('0 13-17 * * *', () => {
        energieSync().catch(err => console.error('energy-prices-sync cron error:', err));
    });

    console.log('Cron tasks scheduled: knmidata-v3 (0 * * * *), satellites-sync (30 * * * *), energy-prices-sync (0 13-17 * * *)');
} else {
    console.log('Cron tasks disabled (local dev)');
}

// file-area-incidents runs in all environments, including local dev — it only reads
// (DB + the already-cached TomTom incidents), never writes/calls an external API itself,
// and the frontend needs live counts to test against locally.
const cron = require('node-cron');
const fileAreaIncidents = require('./tasks/file-area-incidents');
fileAreaIncidents().catch(err => console.error('file-area-incidents initial run error:', err));
// Offset 2 minutes after tomtom-incidents-sync's own */10 7-18 schedule (tomtom.helper.js) —
// no point recalculating before the underlying incident cache has actually refreshed.
cron.schedule('2,12,22,32,42,52 7-18 * * *', () => {
    fileAreaIncidents().catch(err => console.error('file-area-incidents cron error:', err));
}, { timezone: 'Europe/Amsterdam' });
cron.schedule('2 19 * * *', () => {
    fileAreaIncidents().catch(err => console.error('file-area-incidents cron error:', err));
}, { timezone: 'Europe/Amsterdam' });

// strike-area-alerts — same always-on reasoning as file-area-incidents (reads Redis +
// DB only). Runs in local dev too, so it will send real ntfy pushes there if [ntfy] is
// configured, same as the existing lightning-proximity alert already does.
const strikeAreaAlerts = require('./tasks/strike-area-alerts');
strikeAreaAlerts().catch(err => console.error('strike-area-alerts initial run error:', err));
cron.schedule('*/15 * * * * *', () => {
    strikeAreaAlerts().catch(err => console.error('strike-area-alerts cron error:', err));
});
