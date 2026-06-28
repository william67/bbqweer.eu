import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter, skip } from 'rxjs/operators';
import * as L from 'leaflet';
import { LightningService, Strike } from 'src/app/services/lightning.service';

const RING_SPEED       = 343;
const RING_MAX_M       = 10_000;
const RING_DURATION_MS = 30_000;
const MAX_AGE_MS       = 10 * 60 * 1000;
const BOUNDS = { latMin: 40.0, latMax: 59.0, lonMin: -12.0, lonMax: 30.0 };

// ── Two-canvas overlay: grey (bottom) + live (top) ────────────────────────────────────────────
// Live canvas: redrawn every RAF frame — only strikes with age < RING_DURATION_MS. Cost: <1ms.
// Grey canvas: redrawn only on pan/zoom end and fade. addToGrey() paints one bolt additively
//   when a strike transitions live→grey (detected via _liveKeys diff in drawLive).
// No per-strike timers — phase is a pure function of age = now - entry.timeMs.

const CANVAS_PAD = 300;

class StrikeOverlay {
    private greyCanvas:  HTMLCanvasElement;
    private greyCtx:     CanvasRenderingContext2D;
    private liveCanvas:  HTMLCanvasElement;
    private liveCtx:     CanvasRenderingContext2D;
    private strikes:     Map<string, StrikeEntry> | null = null;
    private _origin:     L.Point = L.point(0, 0);
    private _pointCache = new Map<string, L.Point>();
    private _liveCount  = 0;
    private _liveKeys   = new Set<string>();

    constructor(private map: L.Map) {
        this.greyCanvas = L.DomUtil.create('canvas', 'strike-overlay') as HTMLCanvasElement;
        this.greyCtx    = this.greyCanvas.getContext('2d')!;
        map.getPanes().overlayPane!.appendChild(this.greyCanvas);

        this.liveCanvas = L.DomUtil.create('canvas', 'strike-overlay') as HTMLCanvasElement;
        this.liveCtx    = this.liveCanvas.getContext('2d')!;
        map.getPanes().overlayPane!.appendChild(this.liveCanvas);

        map.on('zoomend', () => {
            this._pointCache.clear();
            this._reset();
        });
        map.on('moveend', () => { this._reset(); });
        this._reset();
    }

    private _resize(): void {
        const size   = this.map.getSize();
        const origin = this.map.containerPointToLayerPoint(L.point(-CANVAS_PAD, -CANVAS_PAD));
        this._origin = origin;
        const w = size.x + 2 * CANVAS_PAD;
        const h = size.y + 2 * CANVAS_PAD;
        this.greyCanvas.width  = w; this.greyCanvas.height = h;
        this.liveCanvas.width  = w; this.liveCanvas.height = h;
        L.DomUtil.setPosition(this.greyCanvas, origin);
        L.DomUtil.setPosition(this.liveCanvas, origin);
    }

    private _reset(): void {
        this._resize();
        const now = Date.now();
        if (this.strikes) { this._drawGrey(now); this._syncLiveKeys(now); this._drawLive(now); }
    }

    // Called after every full grey redraw so drawLive() doesn't double-paint on next frame
    private _syncLiveKeys(now: number): void {
        this._liveKeys.clear();
        if (!this.strikes) return;
        for (const [key, entry] of this.strikes) {
            if (now - entry.timeMs < RING_DURATION_MS) this._liveKeys.add(key);
        }
    }

    // Called every RAF frame — detects live→grey transitions, paints grey additively, draws live
    drawLive(strikes: Map<string, StrikeEntry>, now: number): void {
        this.strikes = strikes;
        for (const key of this._liveKeys) {
            const entry = strikes.get(key);
            if (!entry) continue;
            if (now - entry.timeMs >= RING_DURATION_MS) this._addToGrey(key, entry, now);
        }
        this._syncLiveKeys(now);
        this._drawLive(now);
    }

    // Full grey redraw — on initial list, fade(), pan/zoom
    redrawGrey(strikes: Map<string, StrikeEntry>, now: number): void {
        this.strikes = strikes;
        this._drawGrey(now);
        this._syncLiveKeys(now);
    }

    private _addToGrey(key: string, entry: StrikeEntry, now: number): void {
        const w = this.greyCanvas.width;
        const h = this.greyCanvas.height;
        if (!w || !h) return;
        let lp = this._pointCache.get(key);
        if (!lp) { lp = this.map.latLngToLayerPoint([entry.lat, entry.lon]); this._pointCache.set(key, lp); }
        const x = lp.x - this._origin.x;
        const y = lp.y - this._origin.y;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
        const ctx = this.greyCtx;
        ctx.globalAlpha = Math.max(0, 1 - (now - entry.timeMs) / MAX_AGE_MS);
        ctx.beginPath();
        ctx.moveTo(x + 0.20 * 7, y - 1.00 * 7);
        ctx.lineTo(x - 0.60 * 7, y + 0.10 * 7);
        ctx.lineTo(x - 0.10 * 7, y + 0.10 * 7);
        ctx.lineTo(x - 0.20 * 7, y + 1.00 * 7);
        ctx.lineTo(x + 0.60 * 7, y - 0.10 * 7);
        ctx.lineTo(x + 0.10 * 7, y - 0.10 * 7);
        ctx.closePath();
        ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1;
    }

    private _drawLive(now: number): void {
        if (!this.strikes) return;
        const ctx = this.liveCtx;
        const w   = this.liveCanvas.width;
        const h   = this.liveCanvas.height;
        ctx.clearRect(0, 0, w, h);

        for (const [key, entry] of this.strikes) {
            if (now - entry.timeMs >= RING_DURATION_MS) continue;

            let lp = this._pointCache.get(key);
            if (!lp) { lp = this.map.latLngToLayerPoint([entry.lat, entry.lon]); this._pointCache.set(key, lp); }
            const x = lp.x - this._origin.x;
            const y = lp.y - this._origin.y;
            if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;

            let fill: string, stroke: string, sw: number, sz: number;

            if (entry.wasNew && entry.flashStartMs != null) {
                const t       = now - entry.flashStartMs;
                const isWhite = t < 150 || (t >= 200 && t < 350) || (t >= 400 && t < 550);
                fill   = isWhite ? '#ffffff' : '#facc15';
                stroke = isWhite ? '#ffffff' : '#ef4444';
                sw = isWhite ? 2 : 1.5;
                sz = isWhite ? 13 : 10;
            } else {
                fill = '#facc15'; stroke = '#ef4444'; sw = 1.5; sz = 10;
            }

            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.20 * sz, y - 1.00 * sz);
            ctx.lineTo(x - 0.60 * sz, y + 0.10 * sz);
            ctx.lineTo(x - 0.10 * sz, y + 0.10 * sz);
            ctx.lineTo(x - 0.20 * sz, y + 1.00 * sz);
            ctx.lineTo(x + 0.60 * sz, y - 0.10 * sz);
            ctx.lineTo(x + 0.10 * sz, y - 0.10 * sz);
            ctx.closePath();
            ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = sw;
            ctx.fill(); ctx.stroke();
        }

        if (++this._liveCount % 60 === 0) {
            for (const k of this._pointCache.keys()) {
                if (!this.strikes!.has(k)) this._pointCache.delete(k);
            }
        }

        // Rings — canvas arcs, drawn only when zoom >= 11
        const zoom = this.map.getZoom();
        if (zoom >= 11) {
            for (const [key, entry] of this.strikes) {
                if (!entry.hasRing) continue;
                const radiusM = (now - entry.timeMs) / 1000 * RING_SPEED;
                if (radiusM <= 0 || radiusM >= RING_MAX_M) continue;

                let lp = this._pointCache.get(key);
                if (!lp) { lp = this.map.latLngToLayerPoint([entry.lat, entry.lon]); this._pointCache.set(key, lp); }
                const cx = lp.x - this._origin.x;
                const cy = lp.y - this._origin.y;

                // Web Mercator: metres per layer pixel at this lat/zoom
                const mpp = (40075016.686 * Math.abs(Math.cos(entry.lat * Math.PI / 180))) / Math.pow(2, zoom + 8);
                const progress  = radiusM / RING_MAX_M;

                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.pow(1 - progress, 0.5));
                ctx.beginPath();
                ctx.arc(cx, cy, radiusM / mpp, 0, Math.PI * 2);
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth   = Math.max(2, 3 * (1 - progress));
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    private _drawGrey(now: number): void {
        if (!this.strikes) return;
        const ctx = this.greyCtx;
        const w   = this.greyCanvas.width;
        const h   = this.greyCanvas.height;
        ctx.clearRect(0, 0, w, h);

        for (const [key, entry] of this.strikes) {
            if (now - entry.timeMs < RING_DURATION_MS) continue;

            let lp = this._pointCache.get(key);
            if (!lp) { lp = this.map.latLngToLayerPoint([entry.lat, entry.lon]); this._pointCache.set(key, lp); }
            const x = lp.x - this._origin.x;
            const y = lp.y - this._origin.y;
            if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;

            ctx.globalAlpha = Math.max(0, 1 - (now - entry.timeMs) / MAX_AGE_MS);
            ctx.beginPath();
            ctx.moveTo(x + 0.20 * 7, y - 1.00 * 7);
            ctx.lineTo(x - 0.60 * 7, y + 0.10 * 7);
            ctx.lineTo(x - 0.10 * 7, y + 0.10 * 7);
            ctx.lineTo(x - 0.20 * 7, y + 1.00 * 7);
            ctx.lineTo(x + 0.60 * 7, y - 0.10 * 7);
            ctx.lineTo(x + 0.10 * 7, y - 0.10 * 7);
            ctx.closePath();
            ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
            ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    remove(): void {
        this.map.off('zoomstart zoomend moveend');
        this.greyCanvas.remove();
        this.liveCanvas.remove();
    }
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface StrikeEntry {
    timeMs:        number;
    lat:           number;
    lon:           number;
    wasNew:        boolean;
    flashStartMs?: number;
    hasRing?:      boolean;
}

@Component({
    selector: 'app-lightning',
    templateUrl: './lightning.component.html',
    styleUrls: ['./lightning.component.css'],
    standalone: false
})
export class LightningComponent implements OnInit, AfterViewInit, OnDestroy {

    @ViewChild('mapEl') mapEl!: ElementRef;

    activeCount        = 0;
    viewportCount      = 0;
    totalCount         = 0;
    viewportTotalCount = 0;
    showSatellite      = false;
    mapZoom            = 5;
    ringTooltip:       { x: number; y: number; text: string } | null = null;
    delayStats:    { avg: number; min: number; max: number; samples: number } | null = null;
    lastStrikeMs:  number | null = null;

    get avgDelayMs(): number { return this.delayStats?.avg ?? 0; }
    get delayTooltip(): string {
        if (!this.delayStats) return '';
        const { avg, min, max, samples } = this.delayStats;
        return `gem: ${avg}ms | min: ${min}ms | max: ${max}ms (${samples})`;
    }
    private _formatMs(ms: number): string {
        const d     = new Date(ms);
        const today = new Date();
        const time  = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const sameDay = d.getDate()     === today.getDate()     &&
                        d.getMonth()    === today.getMonth()    &&
                        d.getFullYear() === today.getFullYear();
        return sameDay ? time : d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) + ' ' + time;
    }
    get lastStrikeTime(): string { return this.lastStrikeMs ? this._formatMs(this.lastStrikeMs) : ''; }

    private map:             L.Map | null = null;
    private overlay!:        StrikeOverlay;
    private svgRenderer!:    L.SVG;
    private streetLayer!:    L.TileLayer;
    private satelliteLayer!: L.TileLayer;
    private strikeMap      = new Map<string, StrikeEntry>();
    private subs:            Subscription[] = [];
    private fadeTimer:       any;
    private _rafId           = 0;
    private liveSubscribed   = false;

    constructor(private svc: LightningService, private router: Router, private ngZone: NgZone) {}

    ngOnInit(): void {}

    ngAfterViewInit(): void {
        setTimeout(() => {
            this.initMap();

            this.subs.push(
                this.svc.initialList$.subscribe(list => {
                    const now = Date.now();
                    this.clearAllStrikes();
                    list.forEach(s => this.flashStrike(s));
                    this.overlay.redrawGrey(this.strikeMap, now);
                    this.updateViewportCounts();
                    if (!this.liveSubscribed) {
                        this.liveSubscribed = true;
                        this.subs.push(this.svc.newStrike$.subscribe(s => this.flashStrike(s)));
                    }
                })
            );

            this.subs.push(
                this.svc.lightningDelay$.subscribe(s => { this.delayStats = s; })
            );

            this.subs.push(
                this.svc.lightningIndex$.subscribe(d => { this.lastStrikeMs = d?.lastMs ?? null; })
            );

            this.subs.push(
                this.svc.socketReconnect$.subscribe(() => this.svc.requestInitialList())
            );

            this.subs.push(
                this.svc.prefillDone$.subscribe(() => this.svc.requestInitialList())
            );

            this.subs.push(
                this.router.events.pipe(
                    filter(e => e instanceof NavigationEnd && e.urlAfterRedirects.includes('lightning')),
                    skip(1)
                ).subscribe(() => {
                    setTimeout(() => {
                        this.map?.invalidateSize();
                        this.svc.requestInitialList();
                    }, 50);
                })
            );

            if (this.svc.connected) this.svc.requestInitialList();
        });
    }

    private strikeId(s: { timeMs: number; lat: number; lon: number }): string {
        return `${s.timeMs}:${s.lat.toFixed(4)}:${s.lon.toFixed(4)}`;
    }

    private initMap(): void {
        this.svgRenderer = L.svg({ padding: 5 });
        this.map = L.map(this.mapEl.nativeElement, { center: [49.5, 9.0], zoom: 5, preferCanvas: false, zoomAnimation: false });

        this.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        });
        this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri'
        });
        this.streetLayer.addTo(this.map);

        L.rectangle(
            [[BOUNDS.latMin, BOUNDS.lonMin], [BOUNDS.latMax, BOUNDS.lonMax]],
            { color: '#3b82f6', weight: 1.5, dashArray: '6 4', fill: true, fillOpacity: 0.04, renderer: this.svgRenderer }
        ).addTo(this.map);

        this.overlay = new StrikeOverlay(this.map);

        this.map.on('zoomend', () => {
            this.mapZoom = this.map!.getZoom();
            this.updateViewportCounts();
        });

        this.map.on('moveend', () => this.updateViewportCounts());

        this.map.on('mousemove', (e: L.LeafletMouseEvent) => {
            if ((this.map?.getZoom() ?? 0) < 11) return;
            const lp  = this.map!.containerPointToLayerPoint(e.containerPoint);
            const now = Date.now();
            const zoom = this.map!.getZoom();
            let found: { x: number; y: number; text: string } | null = null;

            for (const entry of this.strikeMap.values()) {
                if (!entry.hasRing) continue;
                const radiusM = (now - entry.timeMs) / 1000 * RING_SPEED;
                if (radiusM <= 0 || radiusM >= RING_MAX_M) continue;
                const center = this.map!.latLngToLayerPoint([entry.lat, entry.lon]);
                const mpp    = (40075016.686 * Math.abs(Math.cos(entry.lat * Math.PI / 180))) / Math.pow(2, zoom + 8);
                const dist   = Math.hypot(lp.x - center.x, lp.y - center.y);
                if (Math.abs(dist - radiusM / mpp) < 8) {
                    found = { x: e.containerPoint.x + 12, y: e.containerPoint.y - 10, text: `${Math.round(radiusM / 1000)} km` };
                    break;
                }
            }

            const entering = found !== null;
            const leaving  = this.ringTooltip !== null;
            if (entering || leaving) this.ngZone.run(() => { this.ringTooltip = found; });
        });

        this.map.on('mouseout', () => {
            if (this.ringTooltip) this.ngZone.run(() => { this.ringTooltip = null; });
        });

        this.ngZone.runOutsideAngular(() => {
            this.fadeTimer = setInterval(() => this.fade(), 10_000);
            const loop = (): void => {
                this.tick();
                this._rafId = requestAnimationFrame(loop);
            };
            this._rafId = requestAnimationFrame(loop);
        });
    }

    toggleSatellite(): void {
        if (!this.map) return;
        if (this.showSatellite) {
            this.satelliteLayer.remove();
            this.streetLayer.addTo(this.map);
        } else {
            this.streetLayer.remove();
            this.satelliteLayer.addTo(this.map);
        }
        this.showSatellite = !this.showSatellite;
    }

    // ── Ring lifecycle ────────────────────────────────────────────────────────

    private startRing(entry: StrikeEntry): void {
        if (entry.hasRing) return;
        if (Date.now() - entry.timeMs >= RING_DURATION_MS) return;
        entry.hasRing = true;
    }

    // ── Tick: rings + redraw + count display ──────────────────────────────────

    private tick(): void {
        const now = Date.now();

        this.overlay.drawLive(this.strikeMap, now);

        // Recompute active count from age rather than maintaining state
        let newActive = 0;
        for (const entry of this.strikeMap.values()) {
            if (now - entry.timeMs < RING_DURATION_MS) newActive++;
        }

        const newTotal = this.strikeMap.size;
        if (newTotal !== this.totalCount || newActive !== this.activeCount) {
            this.ngZone.run(() => {
                this.totalCount  = newTotal;
                this.activeCount = newActive;
            });
        }
    }

    // ── Strike lifecycle ──────────────────────────────────────────────────────

    private clearAllStrikes(): void {
        this.strikeMap.clear();
    }

    private flashStrike(strike: Strike): void {
        const key = this.strikeId(strike);
        if (this.strikeMap.has(key)) return;

        const entry: StrikeEntry = {
            timeMs:       strike.timeMs,
            lat:          strike.lat,
            lon:          strike.lon,
            wasNew:       !!strike.isNew,
            flashStartMs: strike.isNew ? Date.now() : undefined,
        };
        this.strikeMap.set(key, entry);

        const isLive = Date.now() - strike.timeMs < RING_DURATION_MS;
        if (isLive && strike.isNew) {
            this.startRing(entry);
        }
    }

    private fade(): void {
        const now = Date.now();
        let anyExpired = false;
        for (const [id, entry] of this.strikeMap) {
            if (now - entry.timeMs > MAX_AGE_MS) {
                this.strikeMap.delete(id);
                anyExpired = true;
            }
        }
        if (anyExpired) this.overlay.redrawGrey(this.strikeMap, now);
        this.ngZone.run(() => this.updateViewportCounts());
    }

    private updateViewportCounts(): void {
        const bounds = this.map?.getBounds();
        if (!bounds) return;
        const now = Date.now();
        let vc = 0, vtc = 0;
        for (const s of this.strikeMap.values()) {
            if (bounds.contains([s.lat, s.lon])) {
                vtc++;
                if (now - s.timeMs < RING_DURATION_MS) vc++;
            }
        }
        this.viewportCount      = vc;
        this.viewportTotalCount = vtc;
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
        clearInterval(this.fadeTimer);
        cancelAnimationFrame(this._rafId);
        this.clearAllStrikes();
        this.overlay?.remove();
        if (this.map) { this.map.remove(); this.map = null; }
    }
}
