import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { WeatherMapsService } from 'src/app/services/weather-maps.service';
import { WeatherMapModel, WeatherMapField, WeatherMapFrame } from 'src/app/api/weather-maps';
import { decodeGrid, isoSegments, findExtremes, GridWindow } from 'src/app/utils/isobars.util';
import { WIND_BANDS, sampleBilinear, sampleNearest, buildSpeedImage, buildColourImage } from 'src/app/utils/wind.util';
import { TEMP_LEGEND, RAIN_BANDS, RainBand, SNOW_BANDS, MIX_BANDS, FREEZING_BANDS, SNOW_RATIO, SNOW_CM_PER_MM, PRECIP_NAMES, tempColour, tempRgb, rainColour, precipColour, encodePrecip } from 'src/app/utils/layers.util';
import { LocalStorageService } from 'src/app/services/local-storage.service';

const MODEL_NAMES: Record<string, string> = { 'ecmwf': 'ECMWF IFS', 'gfs': 'NOAA GFS', 'icon-eu': 'DWD ICON-EU', 'harmonie': 'KNMI HARMONIE' };
const DEFAULT_ID = 'gfs/0.25';
const REFRESH_MS = 5 * 60 * 1000;        // a new run is picked up by asking the model list again
const PLAY_MS = 1200;
const intervalForZoom = (zoom: number) => zoom < 6 ? 4 : zoom < 7 ? 2 : 1;      // hPa between isobars: more lines when zoomed in
const MAX_CACHE = 240;                   // decoded grids kept in the browser
const VIEW_KEY = 'weathercharts_view';

type Layer = 'none' | 'wind' | 'temp' | 'rain';

@Component({
    selector: 'app-weathercharts',
    templateUrl: './weathercharts.component.html',
    styleUrls: ['./weathercharts.component.css'],
    standalone: false
})
export class WeatherChartsComponent implements OnInit, AfterViewInit, OnDestroy {

    @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

    models: WeatherMapModel[] = [];
    modelOptions: { label: string; value: string }[] = [];
    runOptions: { label: string; value: string | null }[] = [];
    selectedId: string | null = null;
    selectedRun: string | null = null;                  // null = the merged timeline, else one run on its own
    frames: WeatherMapFrame[] = [];                     // what the slider runs over: valid time, run and step
    frameIndex = 0;
    maxIndex = 0;
    showLabels = true;
    layer: Layer = 'rain';                            // the colour layer under the isobars
    layerOptions = [{ label: 'Geen laag', value: 'none' }, { label: 'Wind', value: 'wind' },
        { label: 'Temperatuur 2 m', value: 'temp' }, { label: 'Neerslag', value: 'rain' }];
    windMode: 'mean' | 'gust' = 'mean';                 // what the wind colours show: the mean wind or the gusts
    windModeOptions = [{ label: 'gemiddeld', value: 'mean' }, { label: 'windstoten', value: 'gust' }];
    layerNote = '';
    playing = false;
    errorMessage: string | null = null;
    validLabel = '';                                    // the valid time of the map on screen, big at the top
    runLabel = '';                                      // run and step of that map
    infoLine = '';
    isoInterval = 4;                                    // hPa between the isobars on screen
    seamLine = '';

    private map!: L.Map;
    private isoLayer = L.layerGroup();                  // the highs/lows and the outline of the model area
    private lineLayer = L.layerGroup();                 // the isobars and their labels, redrawn per zoom level for the visible part only
    private isoState: { cur: WeatherMapModel; f: WeatherMapField; v: Float32Array } | null = null;
    private isoCover: GridWindow | null = null;         // the part of the grid the isobars on screen cover (with a margin)
    private isoDrawnInterval = 0;
    private isoTimer: any = null;
    private infoBase = '';
    private svgRenderer = L.svg({ padding: 0.5 });          // one shared SVG renderer for all lines (project rule)
    private windLayer = L.layerGroup();                     // the wind arrows, redrawn when the map moves or zooms
    private colourImage: L.ImageOverlay | null = null;      // the colours of the chosen layer
    private legend: L.Control | null = null;
    private windData: { u: Float32Array; v: Float32Array; f: WeatherMapField } | null = null;    // the arrows always show the mean wind
    private mapReady = false;
    private fitted = false;                                // the map is fitted to the data once, then position and zoom stay as they are
    private drawSeq = 0;                                    // a slow draw must not overwrite a newer one
    private playTimer: any = null;
    private refreshTimer: any = null;
    private fields = new Map<string, WeatherMapField>();
    private grids = new Map<string, Float32Array>();
    tip: { x: number; y: number; title: string; rows: { label: string; value: string }[] } | null = null;   // the values at the point under the pointer
    private tipTimer: any = null;
    private tipSeq = 0;                                     // a slow tooltip must not appear after the pointer moved on
    private layoutContent: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private validNow: string | null = null;               // the valid time on screen, kept when the model or run changes

    constructor(private svc: WeatherMapsService, private storage: LocalStorageService) {}

    private get current(): WeatherMapModel | undefined {
        return this.models.find(m => m.id === this.selectedId);
    }

    ngOnInit(): void {
        // the map fills the whole content area (like Lightning and the planetarium): no padding around it
        this.layoutContent = document.querySelector('.layout-content');
        if (this.layoutContent) {
            this.layoutContent.style.position = 'relative';
            this.layoutContent.style.padding = '0';
        }
        this.loadModels();
        this.refreshTimer = setInterval(() => this.loadModels(), REFRESH_MS);
    }

    ngAfterViewInit(): void {
        const saved = this.loadView();
        this.map = L.map(this.mapEl.nativeElement, { center: saved ? [saved.lat, saved.lng] : [52, 8], zoom: saved ? saved.zoom : 5, zoomSnap: 0.25 });
        if (saved) this.fitted = true;                  // the user's position and zoom win over fitting to the data
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Modeldata: ECMWF Open Data (CC BY 4.0), DWD ICON-EU, NOAA GFS, KNMI HARMONIE (CC BY 4.0)',
            maxZoom: 10
        }).addTo(this.map);
        this.lineLayer.addTo(this.map);
        this.isoLayer.addTo(this.map);
        this.windLayer.addTo(this.map);
        this.map.on('moveend', () => { this.drawArrows(); this.saveView(); this.scheduleIsobars(); });
        // the values at a point: after the pointer rests for a moment, gone as soon as it moves, leaves, drags or zooms
        this.map.on('mousemove', (e: L.LeafletMouseEvent) => this.scheduleTip(e));
        this.map.on('mouseout mousedown movestart zoomstart', () => this.hideTip());
        this.mapReady = true;
        setTimeout(() => this.map.invalidateSize(), 0);
        // the container gets its final size after the first render (padding removed, sidebar, window resize): without
        // this Leaflet keeps loading tiles for the old size and parts of the map stay empty
        this.resizeObserver = new ResizeObserver(() => this.map.invalidateSize());
        this.resizeObserver.observe(this.mapEl.nativeElement);
        this.draw();
    }

    ngOnDestroy(): void {
        if (this.playTimer) clearInterval(this.playTimer);
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.resizeObserver?.disconnect();
        if (this.tipTimer) clearTimeout(this.tipTimer);
        if (this.isoTimer) clearTimeout(this.isoTimer);
        if (this.layoutContent) {
            this.layoutContent.style.position = '';
            this.layoutContent.style.padding = '';
        }
        if (this.map) this.map.remove();
    }

    private loadModels(): void {
        this.svc.getModels().subscribe({
            next: (models) => {
                const before = this.current;
                this.models = models;
                this.modelOptions = models.map(m => ({ label: `${MODEL_NAMES[m.model] ?? m.model} ${m.grid}°`, value: m.id }));
                if (!this.selectedId || !models.some(m => m.id === this.selectedId)) {
                    this.selectedId = models.find(m => m.id === DEFAULT_ID)?.id ?? models[0]?.id ?? null;
                }
                const cur = this.current;
                if (before && cur && before.run !== cur.run) { this.fields.clear(); this.grids.clear(); }   // a new run came in, the oldest one went
                this.setupRuns();
                this.errorMessage = null;
                this.draw();
            },
            error: (err: any) => { this.errorMessage = err.error?.error || err.message || 'Er is een fout opgetreden'; }
        });
    }

    // the run dropdown and the frames of the slider for the chosen model and run; keeps the valid time on screen
    private setupRuns(): void {
        const cur = this.current;
        this.runOptions = [{ label: 'Samengesteld (nieuwste run per tijdstip)', value: null },
            ...(cur?.runs ?? []).map((r, i) => ({ label: `Run ${this.fmtLocal(r.run)}${i === 0 ? ' (nieuwste)' : ''}`, value: r.run }))];
        if (this.selectedRun && !cur?.runs.some(r => r.run === this.selectedRun)) this.selectedRun = null;   // that run has gone

        if (!cur) { this.frames = []; }
        else if (!this.selectedRun) { this.frames = cur.timeline; }
        else {
            const r = cur.runs.find(x => x.run === this.selectedRun)!;
            this.frames = r.steps.map(s => ({ valid: new Date(new Date(r.run).getTime() + s * 3600e3).toISOString(), run: r.run, step: s }));
        }
        this.maxIndex = Math.max(0, this.frames.length - 1);
        if (!this.validNow) {
            // first time on the page: the frame closest to now (in the past or the future)
            const now = Date.now();
            let best = 0, bestDiff = Infinity;
            this.frames.forEach((f, k) => {
                const diff = Math.abs(new Date(f.valid).getTime() - now);
                if (diff < bestDiff) { bestDiff = diff; best = k; }
            });
            this.frameIndex = best;
        } else {
            const i = this.frames.findIndex(f => f.valid >= this.validNow!);
            this.frameIndex = i >= 0 ? i : this.maxIndex;      // the same valid time, or the nearest one after it
        }
        this.seamLine = this.seams();
    }

    // "Samengesteld" is made of stretches of different runs: say where it changes
    private seams(): string {
        if (this.selectedRun || this.frames.length === 0) return '';
        const parts: string[] = [];
        let start = 0;
        for (let i = 1; i <= this.frames.length; i++) {
            if (i === this.frames.length || this.frames[i].run !== this.frames[start].run) {
                parts.push(`run ${this.fmtRunHour(this.frames[start].run)} tot ${this.fmtLocal(this.frames[i - 1].valid)}`);
                start = i;
            }
        }
        return parts.length > 1 ? `Samengesteld uit: ${parts.join(', daarna ')}` : '';
    }

    onModelChange(): void {
        this.selectedRun = null;
        this.setupRuns();
        this.draw();
    }

    onRunChange(): void {
        this.setupRuns();
        this.draw();
    }

    onStepChange(): void {
        this.draw();
    }

    // one step back (-1) or forward (+1); a running play stops first, otherwise its timer jumps once more after the click
    stepBy(delta: number): void {
        if (this.playTimer) this.togglePlay();
        const i = this.frameIndex + delta;
        if (i < 0 || i > this.maxIndex) return;
        this.frameIndex = i;
        this.draw();
    }

    togglePlay(): void {
        if (this.playTimer) {
            clearInterval(this.playTimer);
            this.playTimer = null;
            this.playing = false;
            return;
        }
        this.playing = true;
        this.playTimer = setInterval(() => {
            this.frameIndex = this.frameIndex >= this.maxIndex ? 0 : this.frameIndex + 1;
            this.draw();
        }, PLAY_MS);
    }

    private fmtLocal(iso: string): string {
        return new Date(iso).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    private fmtRunHour(iso: string): string {
        const d = new Date(iso);
        return `${d.getUTCDate()}e ${String(d.getUTCHours()).padStart(2, '0')}Z`;
    }

    // one grid, from the cache or the backend; decoded once
    private async load(m: WeatherMapModel, f: { run: string; step: number }, param = 'msl'): Promise<{ field: WeatherMapField; values: Float32Array }> {
        const key = `${m.id}|${f.run}|${f.step}|${param}`;
        let field = this.fields.get(key);
        let values = this.grids.get(key);
        if (!field || !values) {
            field = await firstValueFrom(this.svc.getField(m.model, m.grid, f.run, f.step, param));
            values = await decodeGrid(field);
            this.fields.set(key, field);
            this.grids.set(key, values);
            this.trimCache();
        }
        return { field, values };
    }

    // the oldest grids go when the cache is full (a Map keeps the order of insertion)
    private trimCache(): void {
        if (this.grids.size <= MAX_CACHE) return;
        let drop = this.grids.size - MAX_CACHE + 20;
        for (const key of Array.from(this.grids.keys())) {
            if (drop-- <= 0) break;
            this.grids.delete(key);
            this.fields.delete(key);
        }
    }

    async draw(): Promise<void> {
        const cur = this.current;
        if (!cur || !this.mapReady) return;
        const frame = this.frames[this.frameIndex];
        if (!frame) return;
        const seq = ++this.drawSeq;
        this.hideTip();
        try {
            const { field, values } = await this.load(cur, frame);
            if (seq !== this.drawSeq) return;
            this.validNow = frame.valid;
            this.render(cur, frame, field, values);
            await this.updateLayer(cur, frame, seq);
            this.errorMessage = null;
            this.prefetch(cur);
        } catch (err: any) {
            if (seq !== this.drawSeq) return;
            if (err?.status === 404) { this.loadModels(); return; }                                // the run was replaced meanwhile
            this.errorMessage = err?.error?.error || err?.message || 'Er is een fout opgetreden';
        }
    }

    onLayerChange(): void {
        if (this.layer === 'none') this.clearLayer();
        else this.draw();
    }

    private clearLayer(): void {
        this.windLayer.clearLayers();
        if (this.colourImage) { this.colourImage.remove(); this.colourImage = null; }
        if (this.legend) { this.legend.remove(); this.legend = null; }
        this.windData = null;
        this.layerNote = '';
    }

    // the colour image of the layer goes under the isobars (tile pane)
    private setImage(img: { url: string; bounds: [[number, number], [number, number]] }): void {
        if (this.colourImage) this.colourImage.remove();
        this.colourImage = L.imageOverlay(img.url, img.bounds, { opacity: 0.6, interactive: false, pane: 'tilePane' }).addTo(this.map);
    }

    private setLegend(title: string, rows: { rgb: number[]; text: string }[], footer = ''): void {
        this.setLegendHtml(`<b>${title}</b><br>` + rows.map(r => `<i style="background:rgb(${r.rgb.join(',')})"></i>${r.text}`).join('<br>')
            + (footer ? `<br><small>${footer}</small>` : ''));
    }

    private setLegendHtml(html: string): void {
        if (this.legend) { this.legend.remove(); this.legend = null; }
        const legend = new L.Control({ position: 'bottomright' });
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'wc-legend');
            div.innerHTML = html;
            return div;
        };
        this.legend = legend.addTo(this.map);
    }

    // the legend of the precipitation layer: one list when the run has no type, else a strip of colours per type
    private rainLegend(classes: { derived: boolean } | null, footer: string): void {
        if (!classes) {
            this.setLegend('Neerslag (mm/uur)', RAIN_BANDS.map((b, i) => ({ rgb: b.rgb, text: `${b.min}${RAIN_BANDS[i + 1] ? '-' + RAIN_BANDS[i + 1].min : '+'}` })), footer);
            return;
        }
        const strip = (title: string, bands: RainBand[]) => `<b>${title}</b><br>`
            + bands.map(b => `<i style="background:rgb(${b.rgb.join(',')});width:22px;margin-right:2px"></i>`).join('')
            + `<br><small>${bands.map(b => b.min).join(' � ')}+</small>`;
        const note = classes.derived ? '<br><small>type afgeleid uit sneeuwsom en temperatuur</small>' : '';
        this.setLegendHtml([strip('Regen (mm/uur)', RAIN_BANDS), strip('Natte sneeuw (mm/uur)', MIX_BANDS),
            strip(`Sneeuw (cm/uur, ${SNOW_RATIO}:1)`, SNOW_BANDS), strip('IJzel (mm/uur)', FREEZING_BANDS)].join('<br>') + `<br><small>${footer}</small>${note}`);
    }

    // The type of the precipitation at a point (0 none, 1 rain, 2 mix, 3 snow, 4 freezing rain) as a function of the point and the water
    // (mm per hour); null when the run has no information on the type. A run with `ptype` (ECMWF, GFS) has it per point: the nearest
    // grid point, a class must not be averaged. A run with the accumulated snow (`snow`: ICON-EU, HARMONIE) does not, so the type is
    // DERIVED from the share of snow in the water of the interval (80 % and more is snow, 20 to 80 % mix) and, for the rest, the 2 m
    // temperature (rain at 0 degrees or colder is freezing rain).
    private async precipClasses(cur: WeatherMapModel, frame: WeatherMapFrame, prev: number | null):
            Promise<{ at: (lat: number, lon: number, mm: number) => number; derived: boolean } | null> {
        if (this.hasParam(cur, frame.run, 'ptype')) {
            const g = await this.load(cur, frame, 'ptype');
            return { derived: false, at: (lat, lon) => { const c = sampleNearest(g.values, g.field, lat, lon); return c === null ? 0 : Math.round(c); } };
        }
        if (prev !== null && ['snow', 'precip', 't2m'].every(p => this.hasParam(cur, frame.run, p))) {
            const [s1, s0, p1, p0, t] = await Promise.all([this.load(cur, frame, 'snow'), this.load(cur, { run: frame.run, step: prev }, 'snow'),
                this.load(cur, frame, 'precip'), this.load(cur, { run: frame.run, step: prev }, 'precip'), this.load(cur, frame, 't2m')]);
            return {
                derived: true,
                at: (lat, lon) => {
                    const sn = sampleBilinear(s1.values, s1.field, lat, lon), sb = sampleBilinear(s0.values, s0.field, lat, lon);
                    const pn = sampleBilinear(p1.values, p1.field, lat, lon), pb = sampleBilinear(p0.values, p0.field, lat, lon);
                    if (sn === null || sb === null || pn === null || pb === null || pn - pb <= 0) return 1;
                    const share = Math.min(1, Math.max(0, sn - sb) / (pn - pb));
                    if (share >= 0.8) return 3;
                    if (share > 0.2) return 2;
                    const t2 = sampleBilinear(t.values, t.field, lat, lon);
                    return t2 !== null && t2 <= 0 ? 4 : 1;
                }
            };
        }
        return null;
    }

    // With a type: the value of a point becomes class and rate together (nothing where the type says no precipitation)
    private typed(classes: { at: (lat: number, lon: number, mm: number) => number } | null, rate: (lat: number, lon: number) => number | null): (lat: number, lon: number) => number | null {
        if (!classes) return rate;
        return (lat, lon) => {
            const mm = rate(lat, lon);
            if (mm === null) return null;
            const c = classes.at(lat, lon, mm);
            return c < 1 ? null : encodePrecip(c, mm);
        };
    }

    // does this run have the parameter? (a run from before a parameter was added does not, until the sync has filled it up)
    private hasParam(cur: WeatherMapModel, run: string, param: string): boolean {
        return !!cur.runs.find(r => r.run === run)?.params.includes(param);
    }

    // the step before this one in the same run: the rain of an interval is the difference of two accumulations
    private prevStep(cur: WeatherMapModel, run: string, step: number): number | null {
        const before = (cur.runs.find(r => r.run === run)?.steps ?? []).filter(s => s < step);
        return before.length ? Math.max(...before) : null;
    }

    private async updateLayer(cur: WeatherMapModel, frame: WeatherMapFrame, seq: number): Promise<void> {
        if (this.layer === 'none') { this.clearLayer(); return; }
        this.layerNote = '';
        if (this.layer === 'wind') await this.updateWind(cur, frame, seq);
        else if (this.layer === 'temp') await this.updateTemp(cur, frame, seq);
        else await this.updateRain(cur, frame, seq);
    }

    // u10 and v10 of the frame on screen, then the colours (mean wind or gusts) and the arrows (mean wind)
    private async updateWind(cur: WeatherMapModel, frame: WeatherMapFrame, seq: number): Promise<void> {
        const gustWanted = this.windMode === 'gust';
        const hasGust = gustWanted && this.hasParam(cur, frame.run, 'gust');
        const [fu, fv, fg] = await Promise.all([this.load(cur, frame, 'u10'), this.load(cur, frame, 'v10'),
            hasGust ? this.load(cur, frame, 'gust') : Promise.resolve(null)]);
        if (seq !== this.drawSeq) return;
        this.layerNote = gustWanted && !hasGust ? 'Windstoten zijn voor deze run niet beschikbaar: de gemiddelde wind wordt getoond.' : '';
        this.windData = { u: fu.values, v: fv.values, f: fu.field };
        const f = fu.field;
        const kmh = fg
            ? (lat: number, lon: number) => { const g = sampleBilinear(fg.values, f, lat, lon); return g === null ? null : g * 3.6; }
            : (lat: number, lon: number) => {
                const a = sampleBilinear(fu.values, f, lat, lon), b = sampleBilinear(fv.values, f, lat, lon);
                return a === null || b === null ? null : Math.hypot(a, b) * 3.6;
            };
        this.setImage(buildSpeedImage(f, kmh));
        this.setLegend(`${fg ? 'Windstoten' : 'Wind'} (km/h)`,
            WIND_BANDS.map((b, i) => ({ rgb: b.rgb, text: `${b.min}${WIND_BANDS[i + 1] ? '-' + WIND_BANDS[i + 1].min : '+'}` })),
            'pijl: richting, gemiddelde wind 10 m');
        this.drawArrows();
    }

    private async updateTemp(cur: WeatherMapModel, frame: WeatherMapFrame, seq: number): Promise<void> {
        if (!this.hasParam(cur, frame.run, 't2m')) { this.clearLayer(); this.layerNote = 'Temperatuur is voor deze run niet beschikbaar.'; return; }
        const t = await this.load(cur, frame, 't2m');
        if (seq !== this.drawSeq) return;
        this.windData = null;
        this.windLayer.clearLayers();
        const f = t.field;
        this.setImage(buildColourImage(f, (lat, lon) => sampleBilinear(t.values, f, lat, lon), tempColour));
        this.setLegend('Temperatuur 2 m (°C)', TEMP_LEGEND.map(c => ({ rgb: tempRgb(c), text: String(c) })));
    }

    // rain per hour: the precipitation rate at the step when the run has it (GFS and ECMWF: their totals are packed too coarsely
    // for a difference to be smooth), else the amount that fell since the previous step (the grids hold the total since the
    // start of the run), per hour
    private async updateRain(cur: WeatherMapModel, frame: WeatherMapFrame, seq: number): Promise<void> {
        const classes = await this.precipClasses(cur, frame, this.prevStep(cur, frame.run, frame.step));
        const colour = classes ? precipColour : rainColour;
        if (this.hasParam(cur, frame.run, 'prate')) {
            const r = await this.load(cur, frame, 'prate');
            if (seq !== this.drawSeq) return;
            this.windData = null;
            this.windLayer.clearLayers();
            const f = r.field;
            this.setImage(buildColourImage(f, this.typed(classes, (lat, lon) => sampleBilinear(r.values, f, lat, lon)), colour));
            this.rainLegend(classes, 'intensiteit op dit tijdstip');
            return;
        }
        if (!this.hasParam(cur, frame.run, 'precip')) { this.clearLayer(); this.layerNote = 'Neerslag is voor deze run niet beschikbaar.'; return; }
        const prev = this.prevStep(cur, frame.run, frame.step);
        if (prev === null) { this.clearLayer(); this.layerNote = 'Neerslag: bij +0 uur is er nog niets gevallen, kies een latere stap.'; return; }
        const [a, b] = await Promise.all([this.load(cur, frame, 'precip'), this.load(cur, { run: frame.run, step: prev }, 'precip')]);
        if (seq !== this.drawSeq) return;
        this.windData = null;
        this.windLayer.clearLayers();
        const hours = frame.step - prev;
        const f = a.field;
        this.setImage(buildColourImage(f, this.typed(classes, (lat, lon) => {
            const x = sampleBilinear(a.values, f, lat, lon), y = sampleBilinear(b.values, f, lat, lon);
            return x === null || y === null ? null : Math.max(0, x - y) / hours;
        }), colour));
        this.rainLegend(classes, `gemiddeld over de afgelopen ${hours} uur`);
    }

    // the next frames are fetched ahead, with what the chosen layer needs
    private prefetch(cur: WeatherMapModel): void {
        for (const next of this.frames.slice(this.frameIndex + 1, this.frameIndex + 3)) {
            const jobs: [{ run: string; step: number }, string][] = [[next, 'msl']];
            if (this.layer === 'wind') {
                jobs.push([next, 'u10'], [next, 'v10']);
                if (this.windMode === 'gust') jobs.push([next, 'gust']);
            } else if (this.layer === 'temp') {
                jobs.push([next, 't2m']);
            } else if (this.layer === 'rain') {
                if (this.hasParam(cur, next.run, 'ptype')) jobs.push([next, 'ptype']);
                else if (this.hasParam(cur, next.run, 'snow')) {                                  // the type is derived from the snow and the temperature
                    const p = this.prevStep(cur, next.run, next.step);
                    jobs.push([next, 'snow'], [next, 't2m']);
                    if (p !== null) jobs.push([{ run: next.run, step: p }, 'snow']);
                }
                if (this.hasParam(cur, next.run, 'prate')) jobs.push([next, 'prate']);
                else {
                    jobs.push([next, 'precip']);
                    const p = this.prevStep(cur, next.run, next.step);
                    if (p !== null) jobs.push([{ run: next.run, step: p }, 'precip']);
                }
            }
            for (const [f, param] of jobs) this.load(cur, f, param).catch(() => { /* a failed prefetch shows when that frame is chosen */ });
        }
    }

    // arrows on a grid of about 52 px, so they stay readable at every zoom level; speed from the grid at that point.
    // The grid hangs on the world (pixel coordinates at the current zoom), not on the screen: panning leaves every arrow where
    // it was, only a zoom lays a new grid. It reaches half a screen past the edges, so there are arrows in the area that comes in.
    private drawArrows(): void {
        this.windLayer.clearLayers();
        if (this.layer !== 'wind' || !this.windData || !this.mapReady) return;
        const { u, v, f } = this.windData;
        const zoom = this.map.getZoom(), step = 52, len = 24, head = 7;
        const size = this.map.getSize();
        const bounds = this.map.getPixelBounds();
        const x0 = bounds.min!.x - size.x / 2, x1 = bounds.max!.x + size.x / 2;
        const y0 = bounds.min!.y - size.y / 2, y1 = bounds.max!.y + size.y / 2;
        const toLL = (x: number, y: number) => this.map.unproject(L.point(x, y), zoom);
        const lines: L.LatLngExpression[][] = [];
        for (let y = (Math.floor(y0 / step) + 0.5) * step; y < y1; y += step) {
            for (let x = (Math.floor(x0 / step) + 0.5) * step; x < x1; x += step) {
                const ll = toLL(x, y);
                const uu = sampleBilinear(u, f, ll.lat, ll.lng), vv = sampleBilinear(v, f, ll.lat, ll.lng);
                if (uu === null || vv === null) continue;
                const speed = Math.hypot(uu, vv);
                if (speed * 3.6 < 3) continue;
                const dx = (uu / speed) * len, dy = (-vv / speed) * len;           // east is +x on the screen, north is -y
                const tail = { x: x - dx / 2, y: y - dy / 2 }, tip = { x: x + dx / 2, y: y + dy / 2 };
                const a = Math.atan2(dy, dx);
                lines.push([toLL(tail.x, tail.y), toLL(tip.x, tip.y)]);
                for (const s of [-0.5, 0.5]) {
                    lines.push([toLL(tip.x, tip.y), toLL(tip.x - head * Math.cos(a + s), tip.y - head * Math.sin(a + s))]);
                }
            }
        }
        L.polyline(lines, { renderer: this.svgRenderer, color: '#0f172a', weight: 1.6, opacity: 0.85, interactive: false }).addTo(this.windLayer);
    }

    // the map position and zoom are remembered in the browser (like the location of the forecast page)
    private loadView(): { lat: number; lng: number; zoom: number } | null {
        try {
            const raw = this.storage.getData(VIEW_KEY);
            if (!raw) return null;
            const v = JSON.parse(raw);
            return [v.lat, v.lng, v.zoom].every(x => typeof x === 'number' && isFinite(x)) ? v : null;
        } catch { return null; }
    }

    private saveView(): void {
        try {
            const c = this.map.getCenter();
            this.storage.saveData(VIEW_KEY, JSON.stringify({ lat: +c.lat.toFixed(4), lng: +c.lng.toFixed(4), zoom: this.map.getZoom() }));
        } catch { /* storage may be blocked: the map just starts fitted again next time */ }
    }

    private hideTip(): void {
        if (this.tipTimer) { clearTimeout(this.tipTimer); this.tipTimer = null; }
        this.tipSeq++;
        this.tip = null;
    }

    private scheduleTip(e: L.LeafletMouseEvent): void {
        this.hideTip();
        const seq = this.tipSeq;
        this.tipTimer = setTimeout(() => { this.tipTimer = null; this.showTip(e.latlng, e.containerPoint, seq); }, 300);
    }

    // all the values of the frame on screen at one point, from the same grids as the colours and arrows
    private async showTip(ll: L.LatLng, pt: L.Point, seq: number): Promise<void> {
        const cur = this.current, frame = this.frames[this.frameIndex];
        if (!cur || !frame) return;
        try {
            const has = (p: string) => this.hasParam(cur, frame.run, p);
            const prev = this.prevStep(cur, frame.run, frame.step);
            const useRate = has('prate');                                                // the rate when the run has it, else the difference of two totals
            const [msl, u, v, gust, t2m, p1, p0, rate] = await Promise.all([
                this.load(cur, frame, 'msl'),
                has('u10') ? this.load(cur, frame, 'u10') : null,
                has('v10') ? this.load(cur, frame, 'v10') : null,
                has('gust') ? this.load(cur, frame, 'gust') : null,
                has('t2m') ? this.load(cur, frame, 't2m') : null,
                !useRate && has('precip') && prev !== null ? this.load(cur, frame, 'precip') : null,
                !useRate && has('precip') && prev !== null ? this.load(cur, { run: frame.run, step: prev }, 'precip') : null,
                useRate ? this.load(cur, frame, 'prate') : null
            ]);
            const classes = await this.precipClasses(cur, frame, prev);
            if (seq !== this.tipSeq) return;
            const s = (g: { field: WeatherMapField; values: Float32Array } | null) => g ? sampleBilinear(g.values, g.field, ll.lat, ll.lng) : null;
            const num = (x: number, d = 1) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
            const pressure = s(msl);
            if (pressure === null) return;                                      // outside the model area
            const rows: { label: string; value: string }[] = [{ label: 'Luchtdruk', value: `${num(pressure)} hPa` }];
            const uu = s(u), vv = s(v);
            if (uu !== null && vv !== null) {
                const dir = (270 - Math.atan2(vv, uu) * 180 / Math.PI + 360) % 360;       // the direction the wind comes from
                const compass = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'][Math.round(dir / 22.5) % 16];
                rows.push({ label: 'Wind', value: `${num(Math.hypot(uu, vv) * 3.6, 0)} km/h ${compass} (${num(dir, 0)}°)` });
            }
            const g = s(gust);
            if (g !== null) rows.push({ label: 'Windstoten', value: `${num(g * 3.6, 0)} km/h` });
            const t = s(t2m);
            if (t !== null) rows.push({ label: 'Temperatuur', value: `${num(t)} °C` });
            const rr = s(rate);
            const a = s(p1), b = s(p0);
            let mm: number | null = null;                                              // the water that falls, mm per hour
            if (rr !== null) mm = Math.max(0, rr);
            else if (a !== null && b !== null && prev !== null) mm = Math.max(0, a - b) / (frame.step - prev);
            if (mm !== null) {
                const c = classes ? classes.at(ll.lat, ll.lng, mm) : 0;
                const from = classes?.derived ? ' (afgeleid)' : '';
                if (c === 3) rows.push({ label: `Sneeuw${from}`, value: `${num(mm * SNOW_CM_PER_MM, 1)} cm/uur (${num(mm, 2)} mm water)` });
                else rows.push({ label: c ? PRECIP_NAMES[c] + from : 'Neerslag', value: `${num(mm, 2)} mm/uur` });
            }
            const size = this.map.getSize();
            this.tip = {
                x: pt.x + 16 > size.x - 230 ? pt.x - 226 : pt.x + 16,           // flips to the other side near the edges
                y: pt.y + 16 > size.y - 170 ? pt.y - 166 : pt.y + 16,
                title: `${num(Math.abs(ll.lat), 2)}°${ll.lat >= 0 ? 'N' : 'Z'} ${num(Math.abs(ll.lng), 2)}°${ll.lng >= 0 ? 'O' : 'W'}`,
                rows
            };
        } catch { /* no tooltip when a grid cannot be loaded; the map itself shows the error */ }
    }

    private render(cur: WeatherMapModel, frame: WeatherMapFrame, f: WeatherMapField, v: Float32Array): void {
        this.isoLayer.clearLayers();
        this.isoState = { cur, f, v };
        this.isoCover = null;                                  // a new field: the lines are drawn again
        const ll = (x: number, y: number): L.LatLngExpression => [f.lat0 - y * f.dlat, f.lon0 + x * f.dlon];
        for (const e of findExtremes(v, f)) {
            const colour = e.type === 'H' ? '#b91c1c' : '#1d4ed8';
            L.marker(ll(e.x, e.y), {
                interactive: false,
                icon: L.divIcon({ className: 'wc-hl', html: `<span style="color:${colour}">${e.type}</span><small>${Math.round(e.val)}</small>`, iconSize: [30, 30], iconAnchor: [15, 15] })
            }).addTo(this.isoLayer);
        }
        const south = f.lat0 - (f.ny - 1) * f.dlat, east = f.lon0 + (f.nx - 1) * f.dlon;
        L.rectangle([[south, f.lon0], [f.lat0, east]], { renderer: this.svgRenderer, color: '#64748b', weight: 1, fill: false, dashArray: '4 4', interactive: false }).addTo(this.isoLayer);
        if (!this.fitted) {
            this.map.fitBounds([[south, f.lon0], [f.lat0, east]]);
            this.fitted = true;
        }
        this.validLabel = this.fmtLocal(frame.valid);
        this.runLabel = `run ${this.fmtRunHour(frame.run)} +${frame.step} uur`;
        this.infoBase = `${MODEL_NAMES[cur.model] ?? cur.model} · ${cur.grid}° · ${f.nx}×${f.ny} punten · ${f.min.toFixed(0)}-${f.max.toFixed(0)} hPa`;
        this.drawIsobars();
    }

    // the visible part of the map as grid indices, with `pad` extra around it (a fraction of the view)
    private visibleWindow(f: WeatherMapField, pad: number): GridWindow {
        const b = this.map.getBounds().pad(pad);
        return {
            x0: Math.max(0, Math.floor((b.getWest() - f.lon0) / f.dlon)), x1: Math.min(f.nx - 1, Math.ceil((b.getEast() - f.lon0) / f.dlon)),
            y0: Math.max(0, Math.floor((f.lat0 - b.getNorth()) / f.dlat)), y1: Math.min(f.ny - 1, Math.ceil((f.lat0 - b.getSouth()) / f.dlat))
        };
    }

    // after the map moved: draw the lines again only when the zoom level wants another interval or the view left what is drawn
    private scheduleIsobars(): void {
        if (!this.isoState) return;
        if (this.isoTimer) clearTimeout(this.isoTimer);
        this.isoTimer = setTimeout(() => {
            const st = this.isoState, c = this.isoCover;
            if (!st) return;
            const vis = this.visibleWindow(st.f, 0);
            const inside = c && vis.x0 >= c.x0 && vis.x1 <= c.x1 && vis.y0 >= c.y0 && vis.y1 <= c.y1;
            if (intervalForZoom(this.map.getZoom()) !== this.isoDrawnInterval || !inside) this.drawIsobars();
        }, 120);
    }

    // the isobars and labels of the visible part, at the interval of the zoom level
    private drawIsobars(): void {
        const st = this.isoState;
        if (!st) return;
        const { f, v } = st;
        const interval = intervalForZoom(this.map.getZoom());
        const win = this.visibleWindow(f, 0.25);
        this.lineLayer.clearLayers();
        const ll = (x: number, y: number): L.LatLngExpression => [f.lat0 - y * f.dlat, f.lon0 + x * f.dlon];
        let nSeg = 0;
        for (let lev = Math.ceil(f.min / interval) * interval; lev <= f.max; lev += interval) {
            const flat = isoSegments(v, f.nx, f.ny, lev, win);
            const n = flat.length / 4;
            if (!n) continue;
            nSeg += n;
            const lines: L.LatLngExpression[][] = [];
            for (let i = 0; i < flat.length; i += 4) lines.push([ll(flat[i], flat[i + 1]), ll(flat[i + 2], flat[i + 3])]);
            const weight = lev % 20 === 0 ? 2.4 : interval < 4 && lev % 4 === 0 ? 1.8 : 1.2;
            L.polyline(lines, { renderer: this.svgRenderer, color: lev < 1013 ? '#1d4ed8' : '#b91c1c', weight, opacity: 0.9, interactive: false }).addTo(this.lineLayer);
            if (this.showLabels && lev % (interval * 2) === 0) {
                const every = Math.max(1, Math.floor(n / 5));
                for (let i = Math.floor(every / 2); i < n; i += every) {
                    const o = i * 4;
                    L.marker(ll((flat[o] + flat[o + 2]) / 2, (flat[o + 1] + flat[o + 3]) / 2), {
                        interactive: false, icon: L.divIcon({ className: 'wc-lbl', html: String(lev), iconSize: [0, 0] })
                    }).addTo(this.lineLayer);
                }
            }
        }
        this.isoCover = win;
        this.isoDrawnInterval = interval;
        this.isoInterval = interval;
        this.infoLine = `${this.infoBase} · ${nSeg} lijnstukjes (tijden in lokale tijd, runs in UTC)`;
    }
}
