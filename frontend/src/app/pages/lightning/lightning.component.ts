import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { LightningService, Strike } from 'src/app/services/lightning.service';

const RING_SPEED       = 343;
const RING_MAX_M       = 10_000;
const RING_STEP_MS     = 200;
const RING_DURATION_MS = 30_000;
const MAX_AGE_MS       = 10 * 60 * 1000;

const BOUNDS = { latMin: 40.0, latMax: 59.0, lonMin: -12.0, lonMax: 30.0 };

const STYLE_FLASH  = { radius: 13, color: '#ffffff', fillColor: '#ffffff', fillOpacity: 1, weight: 2,   fill: true };
const STYLE_ACTIVE = { radius: 10, color: '#ef4444', fillColor: '#facc15', fillOpacity: 1, weight: 1.5, fill: true };
const STYLE_OLD    = { radius:  7, color: '#000000', fillColor: '#e5e7eb', fillOpacity: 1, weight: 1,   fill: true };

function boltMarker(latlng: L.LatLngExpression, options: L.CircleMarkerOptions, renderer: L.Canvas): L.CircleMarker {
    const m = L.circleMarker(latlng, { ...options, renderer });
    (m as any)._updatePath = function(this: any): void {
        const r = this._renderer;
        if (!r || !r._ctx || !this._point) return;
        const ctx: CanvasRenderingContext2D = r._ctx;
        const p   = this._point;
        const sz  = Math.max(this._radius, 1);
        ctx.beginPath();
        ctx.moveTo(p.x + 0.20 * sz, p.y - 1.00 * sz);
        ctx.lineTo(p.x - 0.60 * sz, p.y + 0.10 * sz);
        ctx.lineTo(p.x - 0.10 * sz, p.y + 0.10 * sz);
        ctx.lineTo(p.x - 0.20 * sz, p.y + 1.00 * sz);
        ctx.lineTo(p.x + 0.60 * sz, p.y - 0.10 * sz);
        ctx.lineTo(p.x + 0.10 * sz, p.y - 0.10 * sz);
        ctx.closePath();
        r._fillStroke(ctx, this);
    };
    return m;
}

interface RingHandle { circle: L.Circle; timer: number; }

interface StrikeEntry {
    timeMs:      number;
    lat:         number;
    lon:         number;
    marker:      L.CircleMarker;
    isLive:      boolean;           // true while marker is yellow; flipped by styleTimer
    styleTimer?: ReturnType<typeof setTimeout>;
    ring?:       RingHandle;
}

@Component({
    selector: 'app-lightning',
    templateUrl: './lightning.component.html',
    styleUrls: ['./lightning.component.css'],
    standalone: false
})
export class LightningComponent implements OnInit, AfterViewInit, OnDestroy {

    @ViewChild('mapEl') mapEl!: ElementRef;

    activeCount   = 0;
    viewportCount = 0;
    totalCount    = 0;
    avgDelayMs    = 0;
    mapZoom       = 5;

    private delayHistory:  number[] = [];
    private map:           L.Map | null = null;
    private renderer!:     L.Canvas;
    private strikes:       StrikeEntry[] = [];
    private strikeKeys   = new Set<string>();
    private subs:          Subscription[] = [];
    private fadeTimer:     any;
    private liveSubscribed = false;

    constructor(private svc: LightningService) {}

    ngOnInit(): void {}

    ngAfterViewInit(): void {
        setTimeout(() => {
            this.initMap();
            this.subs.push(
                this.svc.initialList$.subscribe(list => {
                    this.clearAllStrikes();
                    list.forEach(s => this.flashStrike(s, false));
                    this.updateCounts();
                    if (!this.liveSubscribed) {
                        this.liveSubscribed = true;
                        this.subs.push(this.svc.newStrike$.subscribe(s => this.flashStrike(s)));
                    }
                })
            );
            if (this.svc.connected) this.svc.requestInitialList();
        });
    }

    private initMap(): void {
        this.renderer = L.canvas({ padding: 0.5 });

        this.map = L.map(this.mapEl.nativeElement, { center: [49.5, 9.0], zoom: 5, preferCanvas: true });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        L.rectangle(
            [[BOUNDS.latMin, BOUNDS.lonMin], [BOUNDS.latMax, BOUNDS.lonMax]],
            { color: '#3b82f6', weight: 1.5, dashArray: '6 4', fill: true, fillOpacity: 0.04 }
        ).addTo(this.map);

        this.map.on('zoomend', () => {
            this.mapZoom = this.map!.getZoom();
            this.refreshRings();
            this.updateCounts();
        });

        this.map.on('moveend', () => this.updateCounts());

        this.fadeTimer = setInterval(() => this.fade(), 10_000);
    }

    // ── Ring lifecycle ────────────────────────────────────────────────────────

    private startRing(entry: StrikeEntry): void {
        if (entry.ring || !this.map) return;
        const remainingMs = RING_DURATION_MS - (Date.now() - entry.timeMs);
        if (remainingMs <= 0) return;

        const startRadius = (RING_DURATION_MS - remainingMs) / 1000 * RING_SPEED;
        let radiusM = startRadius;

        const circle = L.circle([entry.lat, entry.lon], {
            radius: Math.max(1, radiusM), color: '#ffff00',
            weight: 3, fill: false, opacity: 1
        }).addTo(this.map);

        const timer = window.setInterval(() => {
            radiusM += RING_SPEED * RING_STEP_MS / 1000;
            if (radiusM >= RING_MAX_M) {
                this.stopRing(entry);
                return;
            }
            const progress = radiusM / RING_MAX_M;
            circle.setRadius(radiusM);
            circle.setStyle({ opacity: Math.max(0, 1 - progress), weight: Math.max(0.5, 3 * (1 - progress)) });
        }, RING_STEP_MS);

        entry.ring = { circle, timer };
    }

    private stopRing(entry: StrikeEntry): void {
        if (!entry.ring) return;
        clearInterval(entry.ring.timer);
        entry.ring.circle.remove();
        entry.ring = undefined;
    }

    private refreshRings(): void {
        const zoom = this.map?.getZoom() ?? 0;
        const now  = Date.now();
        if (zoom < 10) {
            this.strikes.forEach(e => this.stopRing(e));
        } else {
            this.strikes.forEach(e => {
                if (now - e.timeMs < RING_DURATION_MS) this.startRing(e);
            });
        }
    }

    // ── Strike lifecycle ──────────────────────────────────────────────────────

    private clearAllStrikes(): void {
        for (const entry of this.strikes) {
            clearTimeout(entry.styleTimer);
            this.stopRing(entry);
            entry.marker.remove();
        }
        this.strikes = [];
        this.strikeKeys.clear();
    }

    private flashStrike(strike: Strike, updateDisplay = true): void {
        if (!this.map) return;
        const key = `${strike.timeMs}:${strike.lat.toFixed(4)}:${strike.lon.toFixed(4)}`;
        if (this.strikeKeys.has(key)) return;
        this.strikeKeys.add(key);

        if (strike.isNew) {
            const delay = Date.now() - strike.timeMs;
            if (delay >= 0 && delay < 300_000) {
                this.delayHistory.push(delay);
                if (this.delayHistory.length > 50) this.delayHistory.shift();
                this.avgDelayMs = Math.round(
                    this.delayHistory.reduce((a, b) => a + b, 0) / this.delayHistory.length
                );
            }
        }

        const remainingMs = RING_DURATION_MS - (Date.now() - strike.timeMs);
        const isLive      = remainingMs > 0;

        const marker = boltMarker(
            [strike.lat, strike.lon],
            isLive ? STYLE_ACTIVE : STYLE_OLD,
            this.renderer
        ).addTo(this.map);

        const entry: StrikeEntry = { timeMs: strike.timeMs, lat: strike.lat, lon: strike.lon, marker, isLive };
        this.strikes.push(entry);

        if (isLive) {
            if (strike.isNew) {
                marker.setStyle(STYLE_FLASH);
                marker.setRadius(STYLE_FLASH.radius);
                setTimeout(() => {
                    marker.setStyle(STYLE_ACTIVE);
                    marker.setRadius(STYLE_ACTIVE.radius);
                }, 300);
            }

            entry.styleTimer = setTimeout(() => {
                entry.isLive = false;
                marker.setStyle(STYLE_OLD);
                marker.setRadius(STYLE_OLD.radius);
                entry.styleTimer = undefined;
                this.updateCounts();
            }, remainingMs);

            if (this.map.getZoom() >= 10) this.startRing(entry);
        }

        if (updateDisplay) this.updateCounts();
    }

    private fade(): void {
        const now  = Date.now();
        const dead: StrikeEntry[] = [];
        for (const entry of this.strikes) {
            const age = now - entry.timeMs;
            if (age > MAX_AGE_MS) {
                clearTimeout(entry.styleTimer);
                this.stopRing(entry);
                entry.marker.remove();
                this.strikeKeys.delete(`${entry.timeMs}:${entry.lat.toFixed(4)}:${entry.lon.toFixed(4)}`);
                dead.push(entry);
            } else {
                const opacity = 1 - age / MAX_AGE_MS;
                entry.marker.setStyle({ fillOpacity: opacity, opacity });
            }
        }
        if (dead.length) this.strikes = this.strikes.filter(e => !dead.includes(e));
        this.updateCounts();
    }

    private updateCounts(): void {
        const bounds = this.map?.getBounds();
        const active = this.strikes.filter(s => s.isLive);
        this.activeCount   = active.length;
        this.viewportCount = bounds ? active.filter(s => bounds.contains([s.lat, s.lon])).length : 0;
        this.totalCount    = this.strikes.length;
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
        clearInterval(this.fadeTimer);
        this.clearAllStrikes();
        if (this.map) { this.map.remove(); this.map = null; }
    }
}
