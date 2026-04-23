process.on('uncaughtException', (err) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err);
});

const express    = require('express');
const path       = require('path');
const cors       = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');

const app  = express();
const port = 3000;

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

app.use('/api/knmi-reports',  knmiReportsRouter);
app.use('/api/stars',         starsRouter);
app.use('/api/satellites',    satellitesRouter);
app.use('/api/auth',          authRouter);
app.use('/api/users',         usersRouter);
app.use('/api/server-tasks',  serverTasksRouter);
app.use('/api/energie',       energieRouter);

app.listen(port, () => console.log(`bbqweer backend listening on port ${port}`));

// Cron tasks — skipped in local dev (config.local.ini present)
const fs = require('fs');
if (!fs.existsSync('config.local.ini')) {
    const cron           = require('node-cron');
    const knmiDataSync   = require('./tasks/knmidata-v3');
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
