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
// Live canvas: redrawn every tick (~100ms) — only isLive strikes (~200-400). Draw cost: <1ms.
// Grey canvas: redrawn only on pan/zoom end and fade — potentially thousands of strikes, but rarely.
// Incoming strikes are O(1): just a Map.set + dirty flag. tick() handles all drawing.

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

    constructor(private map: L.Map) {
        this.greyCanvas = L.DomUtil.create('canvas', 'strike-overlay') as HTMLCanvasElement;
        this.greyCtx    = this.greyCanvas.getContext('2d')!;
        map.getPanes().overlayPane!.appendChild(this.greyCanvas);

        this.liveCanvas = L.DomUtil.create('canvas', 'strike-overlay') as HTMLCanvasElement;
        this.liveCtx    = this.liveCanvas.getContext('2d')!;
        map.getPanes().overlayPane!.appendChild(this.liveCanvas);

        map.on('zoomstart', () => {
            this.liveCanvas.style.visibility = 'hidden';
            this.greyCanvas.style.visibility = 'hidden';
        });
        map.on('zoomend', () => {
            this._pointCache.clear();
            this._reset();
            this.liveCanvas.style.visibility = '';
            this.greyCanvas.style.visibility = '';
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
        if (this.strikes) { this._drawGrey(); this._drawLive(); }
    }

    // Called from tick() — live canvas only, O(live strikes) per tick
    drawLive(strikes: Map<string, StrikeEntry>): void {
        this.strikes = strikes;
        this._drawLive();
    }

    // Full grey redraw — only on initial list load, fade(), and pan/zoom (_reset internal)
    redrawGrey(strikes: Map<string, StrikeEntry>): void {
        this.strikes = strikes;
        this._drawGrey();
    }

    // Paint one bolt onto the grey canvas without clearing — called when a strike turns grey
    addToGrey(key: string, entry: StrikeEntry): void {
        const w = this.greyCanvas.width;
        const h = this.greyCanvas.height;
        if (!w || !h) return;
        let lp = this._pointCache.get(key);
        if (!lp) { lp = this.map.latLngToLayerPoint([entry.lat, entry.lon]); this._pointCache.set(key, lp); }
        const x = lp.x - this._origin.x;
        const y = lp.y - this._origin.y;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
        const ctx = this.greyCtx;
        const age = Date.now() - entry.timeMs;
        ctx.globalAlpha = Math.max(0, 1 - age / MAX_AGE_MS);
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

    private _drawLive(): void {
        if (!this.strikes) return;
        const ctx = this.liveCtx;
        const w   = this.liveCanvas.width;
        const h   = this.liveCanvas.height;
        const now = Date.now();
        ctx.clearRect(0, 0, w, h);

        for (const [key, entry] of this.strikes) {
            if (!entry.isLive) continue;

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

        // Evict stale cache entries every 60 live draws (~6s)
        if (++this._liveCount % 60 === 0) {
            for (const k of this._pointCache.keys()) {
                if (!this.strikes!.has(k)) this._pointCache.delete(k);
            }
        }
    }

    private _drawGrey(): void {
        if (!this.strikes) return;
        const ctx = this.greyCtx;
        const w   = this.greyCanvas.width;
        const h   = this.greyCanvas.height;
        const now = Date.now();
        ctx.clearRect(0, 0, w, h);

        for (const [key, entry] of this.strikes) {
            if (entry.isLive) continue;

            let lp = this._pointCache.get(key);
            if (!lp) { lp = this.map.latLngToLayerPoint([entry.lat, entry.lon]); this._pointCache.set(key, lp); }
            const x = lp.x - this._origin.x;
            const y = lp.y - this._origin.y;
            if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;

            const age = now - entry.timeMs;
            ctx.globalAlpha = Math.max(0, 1 - age / MAX_AGE_MS);
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

interface RingHandle { circle: L.Circle; hitCircle: L.Circle; startMs: number; }

interface StrikeEntry {
    timeMs:        number;
    lat:           number;
    lon:           number;
    isLive:        boolean;
    wasNew:        boolean;
    flashStartMs?: number;
    styleTimer?:   ReturnType<typeof setTimeout>;
    ring?:         RingHandle;
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
    private _activeCount   = 0;
    private subs:            Subscription[] = [];
    private fadeTimer:       any;
    private drawTimer:       any;
    private liveSubscribed   = false;

    constructor(private svc: LightningService, private router: Router, private ngZone: NgZone) {}

    ngOnInit(): void {}

    ngAfterViewInit(): void {
        setTimeout(() => {
            this.initMap();

            this.subs.push(
                this.svc.initialList$.subscribe(list => {
                    this.clearAllStrikes();
                    list.forEach(s => this.flashStrike(s));
                    this.overlay.redrawGrey(this.strikeMap);
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
        this.map = L.map(this.mapEl.nativeElement, { center: [49.5, 9.0], zoom: 5, preferCanvas: false });

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
            this.refreshRings();
            this.updateViewportCounts();
        });

        this.map.on('moveend', () => this.updateViewportCounts());

        this.ngZone.runOutsideAngular(() => {
            this.fadeTimer = setInterval(() => this.fade(), 10_000);
            this.drawTimer = setInterval(() => this.tick(), 100);
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
        if (entry.ring || !this.map) return;
        if (Date.now() - entry.timeMs >= RING_DURATION_MS) return;

        const radiusM = (Date.now() - entry.timeMs) / 1000 * RING_SPEED;
        const circle = L.circle([entry.lat, entry.lon], {
            radius: Math.max(1, radiusM), color: '#ffff00',
            weight: 3, fill: false, opacity: 1, renderer: this.svgRenderer
        }).addTo(this.map);

        const hitCircle = L.circle([entry.lat, entry.lon], {
            radius: Math.max(1, radiusM), color: '#ffff00',
            weight: 20, fill: false, opacity: 0.001, interactive: true,
            renderer: this.svgRenderer
        }).addTo(this.map);
        hitCircle.bindTooltip(`${Math.round(radiusM / 1000)} km`, { sticky: true });

        entry.ring = { circle, hitCircle, startMs: entry.timeMs };
    }

    private stopRing(entry: StrikeEntry): void {
        if (!entry.ring) return;
        entry.ring.circle.remove();
        entry.ring.hitCircle.remove();
        entry.ring = undefined;
    }

    private refreshRings(): void {
        if ((this.map?.getZoom() ?? 0) < 9) {
            this.strikeMap.forEach(e => this.stopRing(e));
        }
        // No retroactive ring-starting on zoom-in — only new live strikes get rings
    }

    // ── Tick: rings + redraw + count display ──────────────────────────────────

    private tick(): void {
        const now = Date.now();

        for (const entry of this.strikeMap.values()) {
            if (!entry.ring) continue;
            const radiusM = (now - entry.ring.startMs) / 1000 * RING_SPEED;
            if (radiusM >= RING_MAX_M) {
                this.stopRing(entry);
                continue;
            }
            const progress = radiusM / RING_MAX_M;
            entry.ring.circle.setRadius(radiusM);
            entry.ring.circle.setStyle({ opacity: Math.max(0, Math.pow(1 - progress, 0.5)), weight: Math.max(2, 3 * (1 - progress)) });
            entry.ring.hitCircle.setRadius(radiusM);
            entry.ring.hitCircle.setTooltipContent(`${Math.round(radiusM / 1000)} km`);
        }

        this.overlay.drawLive(this.strikeMap);

        const newTotal  = this.strikeMap.size;
        const newActive = this._activeCount;
        if (newTotal !== this.totalCount || newActive !== this.activeCount) {
            this.ngZone.run(() => {
                this.totalCount  = newTotal;
                this.activeCount = newActive;
            });
        }
    }

    // ── Strike lifecycle ──────────────────────────────────────────────────────

    private clearAllStrikes(): void {
        for (const entry of this.strikeMap.values()) {
            clearTimeout(entry.styleTimer);
            this.stopRing(entry);
        }
        this.strikeMap.clear();
        this._activeCount = 0;
    }

    private flashStrike(strike: Strike): void {
        const key = this.strikeId(strike);
        if (this.strikeMap.has(key)) return;

        const remainingMs = RING_DURATION_MS - (Date.now() - strike.timeMs);
        const isLive      = remainingMs > 0;

        const entry: StrikeEntry = {
            timeMs:       strike.timeMs,
            lat:          strike.lat,
            lon:          strike.lon,
            isLive,
            wasNew:       !!strike.isNew,
            flashStartMs: strike.isNew ? Date.now() : undefined,
        };
        this.strikeMap.set(key, entry);

        if (isLive) {
            this._activeCount++;
            this.ngZone.runOutsideAngular(() => {
                entry.styleTimer = setTimeout(() => {
                    entry.isLive     = false;
                    entry.styleTimer = undefined;
                    this._activeCount--;
                    this.overlay.addToGrey(key, entry);
                }, remainingMs);
            });

            if (strike.isNew && this.map && this.map.getZoom() >= 9) {
                this.startRing(entry);
            }
        }
        // No overlay.draw() here — tick() redraws at 10fps regardless of incoming rate
    }

    private fade(): void {
        const now = Date.now();
        let anyExpired = false;
        for (const [id, entry] of this.strikeMap) {
            if (now - entry.timeMs > MAX_AGE_MS) {
                clearTimeout(entry.styleTimer);
                this.stopRing(entry);
                if (entry.isLive) this._activeCount--;
                this.strikeMap.delete(id);
                anyExpired = true;
            }
        }
        if (anyExpired) this.overlay.redrawGrey(this.strikeMap);
        this.ngZone.run(() => this.updateViewportCounts());
    }

    private updateViewportCounts(): void {
        const bounds = this.map?.getBounds();
        if (!bounds) return;
        let vc = 0, vtc = 0;
        for (const s of this.strikeMap.values()) {
            if (bounds.contains([s.lat, s.lon])) { vtc++; if (s.isLive) vc++; }
        }
        this.viewportCount      = vc;
        this.viewportTotalCount = vtc;
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
        clearInterval(this.fadeTimer);
        clearInterval(this.drawTimer);
        this.clearAllStrikes();
        this.overlay?.remove();
        if (this.map) { this.map.remove(); this.map = null; }
    }
}
