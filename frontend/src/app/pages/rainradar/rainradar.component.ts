'use strict';

import { Component, AfterViewInit, OnDestroy, ElementRef, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { RadarGridService, RadarFrame, RadarFrameInfo, RadarDay } from 'src/app/services/radar-grid.service';
import { LocalStorageService } from 'src/app/services/local-storage.service';
import { loadView as loadSavedView, saveView as saveSavedView, pickExtra, watchResize } from 'src/app/utils/map-view.util';
import {
    GRID_LAYERS, GridLookup, GridSet, RADAR_GRID_BOUNDS, RadarGridInfo,
    buildLookup, codeAt, gridColorTable, inflateGrid, renderGrid
} from 'src/app/utils/radar-grid.util';

import * as L from 'leaflet';

type RadarMode = 'live' | 'history';

// The real values of the HDF5 grids: precipitation (with a 2-hour forecast), echo top and hail probability, painted by the
// browser in our own colour scales
type RadarLayer = GridSet;
const LAYER_IDS: RadarLayer[] = ['precip', 'echotop', 'hail'];
const LAYER_BUTTONS: { id: RadarLayer; label: string; icon?: string; tip: string }[] = [
    { id: 'precip', label: 'Precipitation', icon: 'pi pi-chart-bar', tip: 'Measured precipitation in mm per hour. Click the map for the value' },
    { id: 'echotop', label: 'Echo top', icon: 'pi pi-arrow-up', tip: 'Height of the top of the showers in km: a high top means a thunderstorm tower. Click the map for the value' },
    { id: 'hail', label: 'Hail', icon: 'pi pi-cloud', tip: 'Probability of hail in %. Click the map for the value' }
];

interface GridFrameData {
    url: string;                                // object URL of the painted picture
    codes: Uint8Array | Uint16Array;            // the values, for the click read-out
}

// Rain strip (History): a bar per 5 minutes
interface RainBar {
    h: number;                                  // 0..100, % of the strip height
    kind: 'observed' | 'forecast' | 'missing';
}

interface DayTick {
    left: number;                               // % of the strip width
    label: string;
}

const STEP_MS = 5 * 60 * 1000;
const PLAY_BASE_MS = 600;                       // ms per frame at 1x
const SPEEDS = [1, 2, 4, 8];
const REFRESH_MS = 30 * 1000;                   // live mode: cheap, only the frame list is re-read
const PRELOAD_AHEAD = 20;                       // history: frames loaded ahead of the play head
const MIN_SIZE_SPAN = 3000;                     // bytes; keeps small size differences from looking like rain
const GRID_LIVE_MS = 60 * 60 * 1000;            // grid layer, live: 1 hour back (+ the forecast), the same time base as the KNMI image layer
const GRID_CACHE = 40;                           // painted grid frames kept in memory (about 1 MB each)
const VIEW_KEY = 'rainradar_view';               // where the map was, which layer and map were on: restored on the next visit
const DEFAULT_OPACITY = 0.7;

@Component({
    selector: 'app-rain-radar-map',
    templateUrl: './rainradar.component.html',
    styleUrls: ['./rainradar.component.css'],
    standalone: false
})
export class RainRadarMapComponent implements AfterViewInit, OnDestroy {

    @ViewChild('mapElement') mapElement!: ElementRef;
    @ViewChild('topEl') topEl?: ElementRef<HTMLDivElement>;       // the time at the top: the player opens just below it

    map: L.Map | undefined;
    private streetLayer!: L.TileLayer;
    private satelliteLayer!: L.TileLayer;
    private stopResizeWatch: (() => void) | null = null;
    private radarOverlay: L.ImageOverlay | undefined;
    private bounds: [[number, number], [number, number]] | undefined;

    satelliteMode = false;
    errorMessage: string | null = null;
    loadingDay = false;
    opacity = DEFAULT_OPACITY;

    private startView: { lat: number; lng: number; zoom: number } | null = null;     // the saved position, used once when the map is made

    mode: RadarMode = 'live';
    layer: RadarLayer = 'precip';

    // Grid layer
    private legendControl: L.Control | null = null;
    layerButtons = LAYER_BUTTONS;
    private gridInfos: Partial<Record<GridSet, RadarGridInfo>> = {};      // per set, from the frame list
    private lookup: GridLookup | undefined;                              // the same grid for all sets
    private colorTables: Partial<Record<GridSet, Uint32Array>> = {};
    private gridCache = new Map<string, Promise<GridFrameData>>();   // insertion order = least recently used first
    private drawToken = 0;                                           // a newer frame request makes an older answer obsolete
    private currentGrid: { set: GridSet; codes: Uint8Array | Uint16Array; time: string } | null = null;

    // A "slot" is one 5-minute step of the time line. Live: 1 hour back to +120 min around the
    // latest run. History: one local day. A slot without a frame is a gap in the data.
    slotStartMs = 0;
    slotCount = 0;
    slotFrames: (RadarFrame | undefined)[] = [];
    slot = 0;
    bars: RainBar[] = [];                       // History only
    dayTicks: DayTick[] = [];                   // History only: 00:00 ... 24:00
    referenceTimeMs = 0;                      // issue time of the latest run = "now"

    // History
    historyDays = 30;
    days: RadarDay[] = [];
    selectedDate: Date | null = null;
    minDate: Date | null = null;
    maxDate: Date | null = null;
    disabledDates: Date[] = [];
    private dayKeys = new Set<string>();

    // Playback
    playing = false;
    playerVisible = false;                              // the dialog with the day, play and the slider (opened by a click on the time)
    playerTop = 90;                                     // px from the top of the window: just below the time
    speedIndex = 0;
    private playTimer: any;
    private refreshTimer: any;
    private frameSignature = '';
    private preloaded = new Set<string>();

    private timeFmt = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
    private liveFmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });   // zo 1 nov, 13:00

    constructor(private gridService: RadarGridService, private storage: LocalStorageService,
                private cdr: ChangeDetectorRef) {
        this.loadView();
    }

    private get set(): GridSet { return this.layer; }

    // ---------------------------------------------------------------- getters for the template

    get speed(): number { return SPEEDS[this.speedIndex]; }

    get currentFrame(): RadarFrame | undefined { return this.slotFrames[this.slot]; }

    get currentMs(): number { return this.slotStartMs + this.slot * STEP_MS; }

    // "zo 1 nov, 13:00", in Live and in History (the day picker is in the player, so the date has to be here)
    get currentLabel(): string {
        if (!this.slotCount) return '';
        return this.liveFmt.format(this.currentMs);
    }

    // Minutes to the latest run, only while that is a useful number: "-35 min", "now", "+45 min"
    get offsetLabel(): string {
        if (this.mode !== 'live' || !this.slotCount || !this.referenceTimeMs) return '';   // not in History
        const min = Math.round((this.currentMs - this.referenceTimeMs) / 60000);
        if (Math.abs(min) > 180) return '';
        if (min === 0) return 'now';
        return (min > 0 ? '+' : '') + min + ' min';
    }

    get isForecast(): boolean {
        const f = this.currentFrame;
        return !!f && !f.observed;
    }

    get noDataForDay(): boolean {
        return this.mode === 'history' && !this.loadingDay && this.slotCount > 0 && !this.slotFrames.some(f => !!f);
    }

    get hasPrevDay(): boolean { return this.adjacentDay(-1) !== null; }
    get hasNextDay(): boolean { return this.adjacentDay(1) !== null; }

    // ---------------------------------------------------------------- lifecycle

    ngAfterViewInit() {
        this.map = L.map(this.mapElement.nativeElement, {
            center: this.startView ? [this.startView.lat, this.startView.lng] : [52.1, 5.3],
            zoom: this.startView ? this.startView.zoom : 8,
            minZoom: 5,
            maxZoom: 12,
            doubleClickZoom: false,
            zoomControl: true
        });

        this.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 20
        });

        this.satelliteLayer = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri &mdash; Esri, i-cubed, USDA, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
            maxZoom: 20
        });

        (this.satelliteMode ? this.satelliteLayer : this.streetLayer).addTo(this.map);
        this.map.attributionControl.addAttribution('Radar: <a href="https://dataplatform.knmi.nl/">KNMI</a> (CC-BY 4.0)');
        this.map.on('click', (e: L.LeafletMouseEvent) => this.onMapClick(e));
        this.map.on('moveend', () => this.saveView());
        this.updateLegend();
        this.stopResizeWatch = watchResize(this.map, this.mapElement.nativeElement);     // see utils/map-view.util.ts

        this.loadLive();
        this.refreshTimer = setInterval(() => { if (this.mode === 'live') this.loadLive(); }, REFRESH_MS);
        this.cdr.detectChanges();                             // the settings button gets the map (in the same pass, no ExpressionChanged error)
    }

    ngOnDestroy() {
        this.stop();
        clearInterval(this.refreshTimer);
        this.stopResizeWatch?.();
        this.drawToken++;
        for (const p of this.gridCache.values()) p.then(g => URL.revokeObjectURL(g.url)).catch(() => undefined);
        this.gridCache.clear();
        this.map?.remove();
    }

    // Space = play/pause, arrows = step (not while typing in the date field or using a control)
    @HostListener('window:keydown', ['$event'])
    onKey(event: KeyboardEvent) {
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        if (event.key === ' ') { event.preventDefault(); this.togglePlay(); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); this.step(1); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); this.step(-1); }
    }

    // ---------------------------------------------------------------- map controls

    toggleSatellite() {
        if (!this.map) return;
        this.satelliteMode = !this.satelliteMode;
        if (this.satelliteMode) {
            this.map.removeLayer(this.streetLayer);
            this.satelliteLayer.addTo(this.map);
            this.satelliteLayer.bringToBack();
        } else {
            this.map.removeLayer(this.satelliteLayer);
            this.streetLayer.addTo(this.map);
            this.streetLayer.bringToBack();
        }
        this.saveView();
    }

    // The opacity comes from the settings component (also once at the start, with the saved value)
    onOpacityChange(value: number) {
        this.opacity = value;
        this.updateOverlayOpacity();
    }

    // The saved position and the choices that go with it (utils/map-view.util.ts). The values are checked: a bad entry just leaves the defaults.
    private loadView() {
        const v = loadSavedView(this.storage, VIEW_KEY, 5, 12);
        if (!v) return;
        this.startView = { lat: v.lat, lng: v.lng, zoom: v.zoom };
        const e = pickExtra(v, {
            layer: x => LAYER_IDS.includes(x),
            satellite: x => typeof x === 'boolean'
        });
        if (e.layer) this.layer = e.layer;
        if (e.satellite !== undefined) this.satelliteMode = e.satellite;
    }

    private saveView() {
        if (this.map) saveSavedView(this.storage, VIEW_KEY, this.map, { layer: this.layer, satellite: this.satelliteMode });
    }

    // ---------------------------------------------------------------- mode: live / history

    setMode(mode: RadarMode) {
        if (mode === this.mode) return;
        this.stop();
        this.mode = mode;
        this.frameSignature = '';
        if (mode === 'live') {
            this.slotCount = 0;
            this.loadLive();
        } else {
            this.loadHistory();
        }
    }

    // KNMI colour images <-> the precipitation grids; the time line, the player and the day picker stay the same
    setLayer(layer: RadarLayer) {
        if (layer === this.layer) return;
        this.stop();
        this.layer = layer;
        this.drawToken++;
        this.frameSignature = '';
        this.slotCount = 0;
        this.slotFrames = [];
        this.bars = [];
        this.errorMessage = null;
        this.currentGrid = null;
        this.map?.closePopup();
        this.updateLegend();
        this.saveView();
        this.radarOverlay?.remove();                 // the two layers have different bounds and image sources
        this.radarOverlay = undefined;
        this.bounds = undefined;
        if (this.mode === 'live') this.loadLive();
        else this.loadHistory();
    }

    // The colour scale of the chosen grid layer, bottom right in the map (like the weather charts page)
    private updateLegend() {
        this.legendControl?.remove();
        this.legendControl = null;
        if (!this.map) return;
        const def = GRID_LAYERS[this.set];
        const html = `<b>${def.title}</b><br>` + def.classes.map((c, i) => {
            const next = def.classes[i + 1];
            return `<i style="background:${c.color}"></i>${c.min}${next ? '-' + next.min : '+'}`;
        }).join('<br>');
        const control = new L.Control({ position: 'bottomright' });
        control.onAdd = () => {
            const div = L.DomUtil.create('div', 'rr-legend');
            div.innerHTML = html;
            return div;
        };
        this.legendControl = control.addTo(this.map);
    }

    // ---------------------------------------------------------------- where the frames come from

    private framesLive$(): Observable<RadarFrameInfo> {
        const to = Math.floor(Date.now() / 60000) * 60000;                      // whole minutes: the route takes no milliseconds
        return this.gridFrames$({ from: this.toIso(to - GRID_LIVE_MS), to: this.toIso(to) }, this.layer === 'precip');   // only precipitation has a forecast
    }

    private framesRange$(range: { from: string; to: string }): Observable<RadarFrameInfo> {
        return this.gridFrames$(range);
    }

    private days$(): Observable<{ days: RadarDay[] }> {
        return this.gridService.getDays(this.set);
    }

    // The grid frames in the shape of the image frames, so the rest of this component does not care which layer it shows
    private gridFrames$(range: { from: string; to: string }, withForecast = false): Observable<RadarFrameInfo> {
        const set = this.set;
        return this.gridService.getFrames(set, range, withForecast).pipe(map(res => {
            if (res.grid) this.gridInfos[set] = res.grid;
            const days = res.oldest ? Math.max(1, Math.ceil((Date.now() - Date.parse(res.oldest)) / 86400000)) : this.historyDays;
            return {
                referenceTime: res.newest,
                bounds: RADAR_GRID_BOUNDS,
                historyDays: days,
                oldest: res.oldest,
                frames: [
                    ...res.frames.map(f => ({ time: f.ts, file: set + '|' + f.ts, v: f.v, size: f.size, observed: true })),
                    ...(res.forecast?.frames ?? []).map(f => ({ time: f.ts, file: set + '-fc|' + f.ts, v: f.v, size: f.size, observed: false }))
                ]
            };
        }));
    }

    // ---------------------------------------------------------------- live

    // Frame list of the live window; rebuilds only when a new run (or rewritten frames) arrived
    private loadLive() {
        this.framesLive$().subscribe({
            next: (info: RadarFrameInfo) => {
                if (this.mode !== 'live') return;
                if (!info.frames.length || !info.referenceTime) {
                    this.errorMessage = 'The backend is still fetching the first radar frames — retrying…';
                    return;
                }
                this.errorMessage = null;
                this.historyDays = info.historyDays ?? this.historyDays;
                this.setBounds(info.bounds);

                const signature = info.referenceTime + '|' + info.frames.map(f => f.file + ':' + f.v).join(',');
                if (signature === this.frameSignature) return;
                this.frameSignature = signature;

                const keepMs = this.slotCount ? this.currentMs : null;
                this.referenceTimeMs = Date.parse(info.referenceTime);
                const first = Date.parse(info.frames[0].time);
                const last = Date.parse(info.frames[info.frames.length - 1].time);
                this.buildSlots(info.frames, first, Math.round((last - first) / STEP_MS) + 1);

                // Keep the frame the user was looking at; otherwise start at the "now" frame
                let target = keepMs !== null ? Math.round((keepMs - this.slotStartMs) / STEP_MS) : -1;
                if (target < 0 || target >= this.slotCount || !this.slotFrames[target]) {
                    target = Math.round((this.referenceTimeMs - this.slotStartMs) / STEP_MS);
                }
                this.slot = this.nearestSlotWithFrame(target, 1);
                this.preloadAhead();
                this.applyFrame();
            },
            error: (err: any) => {
                this.errorMessage = err.error?.error || err.message || 'Radar frames could not be loaded';
            }
        });
    }

    goNow() {
        if (this.mode !== 'live' || !this.slotCount) return;
        this.slot = this.nearestSlotWithFrame(Math.round((this.referenceTimeMs - this.slotStartMs) / STEP_MS), 1);
        this.applyFrame();
    }

    // ---------------------------------------------------------------- history

    private loadHistory() {
        this.days$().subscribe({
            next: res => {
                this.days = res.days;
                this.dayKeys = new Set(res.days.map(d => d.date));
                if (!res.days.length) {
                    this.errorMessage = 'No radar history yet';
                    return;
                }
                this.errorMessage = null;
                this.minDate = this.dateFromKey(res.days[0].date);
                this.maxDate = this.dateFromKey(res.days[res.days.length - 1].date);
                this.disabledDates = this.missingDaysBetween(this.minDate, this.maxDate);

                // Today if it has frames (looking at "what just happened"), otherwise the latest day
                const todayKey = this.localDateStr(new Date());
                const key = this.dayKeys.has(todayKey) ? todayKey : res.days[res.days.length - 1].date;
                this.selectedDate = this.dateFromKey(key);
                this.loadDay(this.selectedDate, null);
            },
            error: (err: any) => {
                this.errorMessage = err.error?.error || err.message || 'Radar history could not be loaded';
            }
        });
    }

    onDateChange(date: Date | null) {
        if (!date) return;
        this.stop();
        this.loadDay(date, this.slotCount ? this.currentMs : null);
    }

    goDay(delta: number) {
        const key = this.adjacentDay(delta);
        if (!key) return;
        this.stop();
        this.selectedDate = this.dateFromKey(key);
        this.loadDay(this.selectedDate, this.slotCount ? this.currentMs : null);
    }

    // Loads the frames of one local day. keepMs = the moment the user was looking at: the same
    // time of day is selected on the new day (when that frame exists).
    private loadDay(date: Date, keepMs: number | null) {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
        const count = Math.round((end - start) / STEP_MS);
        this.loadingDay = true;
        this.framesRange$({ from: this.toIso(start), to: this.toIso(end - STEP_MS) }).subscribe({
            next: (info: RadarFrameInfo) => {
                this.loadingDay = false;
                if (this.mode !== 'history') return;
                this.errorMessage = null;
                this.setBounds(info.bounds);
                this.historyDays = info.historyDays ?? this.historyDays;
                this.referenceTimeMs = info.referenceTime ? Date.parse(info.referenceTime) : 0;
                this.buildSlots(info.frames, start, count);

                let target: number;
                if (keepMs !== null) {
                    const d = new Date(keepMs);
                    const keepSlot = Math.round(((new Date(date.getFullYear(), date.getMonth(), date.getDate(), d.getHours(), d.getMinutes())).getTime() - start) / STEP_MS);
                    target = keepSlot;
                } else if (this.referenceTimeMs >= start && this.referenceTimeMs < end) {
                    target = Math.round((this.referenceTimeMs - start) / STEP_MS);      // today: the latest run
                } else {
                    target = 0;
                }
                target = Math.min(Math.max(target, 0), count - 1);
                this.slot = this.nearestSlotWithFrame(target, 1);
                this.preloadAhead();
                this.applyFrame();
            },
            error: (err: any) => {
                this.loadingDay = false;
                this.errorMessage = err.error?.error || err.message || 'Radar frames could not be loaded';
            }
        });
    }

    private adjacentDay(delta: number): string | null {
        if (this.mode !== 'history' || !this.selectedDate || !this.days.length) return null;
        const key = this.localDateStr(this.selectedDate);
        const keys = this.days.map(d => d.date);
        const i = keys.indexOf(key);
        const j = i < 0 ? -1 : i + delta;
        if (i < 0) {                                        // a date that has no frames: nearest in that direction
            const cand = delta < 0 ? keys.filter(k => k < key).slice(-1)[0] : keys.find(k => k > key);
            return cand ?? null;
        }
        return j >= 0 && j < keys.length ? keys[j] : null;
    }

    private missingDaysBetween(from: Date, to: Date): Date[] {
        const out: Date[] = [];
        for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
            if (!this.dayKeys.has(this.localDateStr(d))) out.push(new Date(d));
        }
        return out;
    }

    // ---------------------------------------------------------------- slots

    private buildSlots(frames: RadarFrame[], startMs: number, count: number) {
        this.slotStartMs = startMs;
        this.slotCount = count;
        this.slotFrames = new Array(count).fill(undefined);
        for (const f of frames) {
            const i = Math.round((Date.parse(f.time) - startMs) / STEP_MS);
            if (i >= 0 && i < count) this.slotFrames[i] = f;
        }
        this.preloaded.clear();
        if (this.mode === 'history') {
            this.buildBars();
            this.buildDayTicks();
        } else {
            this.bars = [];
            this.dayTicks = [];
        }
    }

    // Rain strip: the height of a bar follows the file size of the picture (more rain = a bigger PNG)
    private buildBars() {
        const sizes = this.slotFrames.filter((f): f is RadarFrame => !!f).map(f => f.size);
        const min = sizes.length ? Math.min(...sizes) : 0;
        const span = Math.max((sizes.length ? Math.max(...sizes) : 0) - min, MIN_SIZE_SPAN);
        this.bars = this.slotFrames.map(f => {
            if (!f) return { h: 0, kind: 'missing' as const };
            const h = 10 + 90 * Math.min(1, Math.max(0, (f.size - min) / span));
            return { h, kind: f.observed ? 'observed' as const : 'forecast' as const };
        });
    }

    // Labels every 3 hours from 00:00 to 24:00 (the end of the day, at 100%)
    private buildDayTicks() {
        const pad = (n: number) => String(n).padStart(2, '0');
        const ticks: DayTick[] = [];
        for (let i = 0; i < this.slotCount; i++) {
            const d = new Date(this.slotStartMs + i * STEP_MS);
            if (d.getMinutes() !== 0 || d.getHours() % 3 !== 0) continue;
            ticks.push({ left: i / this.slotCount * 100, label: `${pad(d.getHours())}:00` });
        }
        ticks.push({ left: 100, label: '24:00' });
        this.dayTicks = ticks;
    }

    // A click on the strip jumps to that time of the day
    onStripClick(event: MouseEvent) {
        if (!this.slotCount) return;
        const el = event.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        const pad = 8;                                      // same side padding as the strip
        const frac = (event.clientX - rect.left - pad) / Math.max(1, rect.width - 2 * pad);
        const wanted = Math.min(this.slotCount - 1, Math.max(0, Math.floor(frac * this.slotCount)));
        this.slot = this.nearestSlotWithFrame(wanted, wanted >= this.slot ? 1 : -1);
        this.applyFrame();
    }

    // ---------------------------------------------------------------- overlay

    private setBounds(bounds: [[number, number], [number, number]]) {
        if (!this.map) return;
        const changed = !this.bounds || JSON.stringify(bounds) !== JSON.stringify(this.bounds);
        this.bounds = bounds;
        if (this.radarOverlay && changed) this.radarOverlay.setBounds(L.latLngBounds(bounds));
    }

    private applyFrame() {
        const frame = this.currentFrame;
        if (!this.map || !this.bounds) return;
        if (frame) {
            this.showGridFrame(frame);
            return;
        }
        this.updateOverlayOpacity();
        this.preloadAhead();
    }

    // Hidden while the chosen day has no frames at all
    private updateOverlayOpacity() {
        this.radarOverlay?.setOpacity(this.noDataForDay ? 0 : this.opacity);
    }

    // Images go into the browser cache first, so stepping / playing never waits for a download.
    // Live: the whole window (37 small frames). History: the next frames after the play head.
    private preloadAhead() {
        const wrap = this.mode === 'live';                                // live is a short loop (37 frames): all of it, and round again
        const n = wrap ? this.slotCount : PRELOAD_AHEAD;
        for (let k = 0; k <= n; k++) {
            let i = this.slot + k;
            if (i >= this.slotCount) {
                if (!wrap) break;
                i = i % this.slotCount;
            }
            const f = this.slotFrames[i];
            if (!f) continue;
            // download, inflate and paint it now, so playing never waits
            const key = this.gridKey(f);
            if (this.preloaded.has(key)) continue;
            this.preloaded.add(key);
            this.gridImage(f, this.set).catch(() => this.preloaded.delete(key));
        }
    }

    // ---------------------------------------------------------------- the grid layers

    private gridKey(f: RadarFrame): string {
        return this.layer + (f.observed ? '|' : '-fc|') + f.time + '|' + f.v;
    }

    // One grid painted into a picture, kept in a small least-recently-used cache
    private gridImage(f: RadarFrame, set: GridSet): Promise<GridFrameData> {
        const key = this.gridKey(f);
        let p = this.gridCache.get(key);
        if (p) {
            this.gridCache.delete(key);                      // move to the end: most recently used
        } else {
            p = this.loadGrid(f, set);
            p.catch(() => this.gridCache.delete(key));
        }
        this.gridCache.set(key, p);
        while (this.gridCache.size > GRID_CACHE) {
            const oldest = this.gridCache.keys().next().value as string;
            const old = this.gridCache.get(oldest);
            this.gridCache.delete(oldest);
            old?.then(g => URL.revokeObjectURL(g.url)).catch(() => undefined);
        }
        return p;
    }

    private async loadGrid(f: RadarFrame, set: GridSet): Promise<GridFrameData> {
        const info = this.gridInfos[set];
        if (!info) throw new Error('Radar grid description missing');
        const bytes = await firstValueFrom(this.gridService.getFrame(set, { ts: f.time, v: f.v }, !f.observed));
        const codes = await inflateGrid(bytes, info.dtype);
        if (!this.lookup) this.lookup = buildLookup(info.rows, info.cols);
        const table = this.colorTables[set] ?? (this.colorTables[set] = gridColorTable(set, info));
        const canvas = document.createElement('canvas');
        renderGrid(codes, this.lookup, table, canvas);
        const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('The radar picture could not be made')), 'image/png'));
        return { url: URL.createObjectURL(blob), codes };
    }

    private async showGridFrame(frame: RadarFrame) {
        const token = ++this.drawToken;
        const set = this.set;
        try {
            const g = await this.gridImage(frame, set);
            if (token !== this.drawToken || this.layer !== set || !this.map || !this.bounds) return;   // a newer request took over
            this.currentGrid = { set, codes: g.codes, time: frame.time };
            if (!this.radarOverlay) {
                this.radarOverlay = L.imageOverlay(g.url, this.bounds, { opacity: this.opacity, interactive: false }).addTo(this.map);
            } else {
                this.radarOverlay.setUrl(g.url);
            }
            this.updateOverlayOpacity();
            this.preloadAhead();
        } catch (err: any) {
            if (token === this.drawToken) this.errorMessage = err?.error?.error || err?.message || 'The radar grid could not be loaded';
        }
    }

    // A click on the map shows the value of the shown frame at that spot
    private onMapClick(e: L.LeafletMouseEvent) {
        const grid = this.currentGrid;
        if (!this.map || !grid || grid.set !== this.layer) return;
        const info = this.gridInfos[grid.set];
        if (!info) return;
        const code = codeAt(grid.codes, e.latlng.lat, e.latlng.lng, info);
        let text: string;
        if (code === null || (code !== 0 && info.nodata.includes(code)) || (code === 0 && grid.set === 'precip' && info.nodata.includes(0))) {
            text = 'No radar data here';                          // outside the radar image or no data
        } else if (grid.set === 'precip') {
            const rate = GRID_LAYERS.precip.value(code, info);
            text = rate < 0.05 ? 'No rain' : `<b>${rate.toFixed(1)} mm/h</b><br><span class="text-sm">${(code * info.scale).toFixed(2)} mm in 5 minutes</span>`;
        } else if (code === 0) {                                  // echo top and hail: 0 = nothing there
            text = grid.set === 'echotop' ? 'No echo' : 'No hail probability';
        } else if (grid.set === 'echotop') {
            text = `<b>${GRID_LAYERS.echotop.value(code, info).toFixed(1)} km</b><br><span class="text-sm">top of the echo</span>`;
        } else {
            text = `<b>${Math.round(GRID_LAYERS.hail.value(code, info))}%</b><br><span class="text-sm">probability of hail</span>`;
        }
        const when = new Date(grid.time);
        L.popup({ closeButton: true, autoPan: false })
            .setLatLng(e.latlng)
            .setContent(`${text}<br><span class="text-sm">${this.timeFmt.format(when)}</span>`)
            .openOn(this.map);
    }

    // ---------------------------------------------------------------- slider, stepping, playing

    onSlide(event: Event) {
        const wanted = +(event.target as HTMLInputElement).value;
        this.slot = this.nearestSlotWithFrame(wanted, wanted >= this.slot ? 1 : -1);
        this.applyFrame();
    }

    // The slot itself when it has a frame, otherwise the closest one (preferring `dir`)
    private nearestSlotWithFrame(slot: number, dir: number): number {
        if (slot < 0) slot = 0;
        if (slot >= this.slotCount) slot = this.slotCount - 1;
        if (this.slotFrames[slot]) return slot;
        for (let d = 1; d < this.slotCount; d++) {
            const a = slot + d * dir;
            const b = slot - d * dir;
            if (a >= 0 && a < this.slotCount && this.slotFrames[a]) return a;
            if (b >= 0 && b < this.slotCount && this.slotFrames[b]) return b;
        }
        return slot;
    }

    // Moves to the next slot that has a frame; wraps around in live mode, stops at the ends in history.
    // Returns false when it could not move (end of the day).
    step(delta: number): boolean {
        if (!this.slotCount) return false;
        const dir = delta < 0 ? -1 : 1;
        let i = this.slot;
        for (let n = 0; n < this.slotCount; n++) {
            i += dir;
            if (i < 0 || i >= this.slotCount) {
                if (this.mode === 'history') return false;
                i = (i + this.slotCount) % this.slotCount;
            }
            if (this.slotFrames[i]) {
                this.slot = i;
                this.applyFrame();
                return true;
            }
        }
        return false;
    }

    // one frame back or forward from the time at the top; a running play stops first
    stepBy(delta: number) {
        if (this.playing) this.stop();
        this.step(delta);
    }

    openPlayer() {
        const r = this.topEl?.nativeElement.getBoundingClientRect();
        if (r) this.playerTop = Math.round(r.bottom + 8);
        this.playerVisible = true;
    }

    togglePlay() {
        if (this.playing) { this.stop(); return; }
        if (!this.slotCount) return;
        this.playing = true;
        this.playerVisible = false;                          // starting closes the player, so the map is free to watch
        this.schedulePlay();
    }

    cycleSpeed() {
        this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
        if (this.playing) this.schedulePlay();
    }

    private schedulePlay() {
        clearInterval(this.playTimer);
        this.playTimer = setInterval(() => {
            if (!this.step(1)) this.stop();                 // end of the day
        }, PLAY_BASE_MS / this.speed);
    }

    private stop() {
        this.playing = false;
        clearInterval(this.playTimer);
    }

    // ---------------------------------------------------------------- helpers

    private toIso(ms: number): string {
        return new Date(ms).toISOString().replace('.000Z', 'Z');
    }

    // Local calendar date, never toISOString() (UTC shift)
    private localDateStr(d: Date): string {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    private dateFromKey(key: string): Date {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
}
