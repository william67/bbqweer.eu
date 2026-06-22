import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { LightningService, Strike } from 'src/app/services/lightning.service';

const RING_SPEED       = 343;
const RING_MAX_M       = 10_000;
const RING_STEP_MS     = 200;
const RING_DURATION_MS = Math.ceil(RING_MAX_M / RING_SPEED * 1000);
const ACTIVE_WINDOW_MS = 60_000;
const MAX_AGE_MS       = 10 * 60 * 1000;

const BOUNDS = { latMin: 40.0, latMax: 59.0, lonMin: -12.0, lonMax: 30.0 };

const STYLE_ACTIVE = { radius: 10, color: '#ef4444', fillColor: '#facc15', fillOpacity: 1, weight: 1.5, fill: true };
const STYLE_OLD    = { radius:  7, color: '#000000', fillColor: '#e5e7eb', fillOpacity: 1, weight: 1,   fill: true };

// Canvas-rendered bolt marker — draws the ⚡ shape on a shared canvas instead of a DOM element.
// Overrides _updatePath (Leaflet internal) to draw the bolt path, then delegates fill/stroke
// to the renderer's _fillStroke so all Leaflet style options (color, opacity, weight) work normally.
function boltMarker(latlng: L.LatLngExpression, options: L.CircleMarkerOptions, renderer: L.Canvas): L.CircleMarker {
    const m = L.circleMarker(latlng, { ...options, renderer });
    (m as any)._updatePath = function(this: any): void {
        const r = this._renderer;
        if (!r || !r._ctx || !this._point) return;
        const ctx: CanvasRenderingContext2D = r._ctx;
        const p   = this._point;
        const sz  = Math.max(this._radius, 1);
        // Bolt path (same topology as SVG "M6 0L0 9h4l-1 7 7-9H6Z" scaled to ±sz)
        ctx.beginPath();
        ctx.moveTo(p.x + 0.20 * sz, p.y - 1.00 * sz);  // top
        ctx.lineTo(p.x - 0.60 * sz, p.y + 0.10 * sz);  // middle-left
        ctx.lineTo(p.x - 0.10 * sz, p.y + 0.10 * sz);  // indent right
        ctx.lineTo(p.x - 0.20 * sz, p.y + 1.00 * sz);  // bottom tip
        ctx.lineTo(p.x + 0.60 * sz, p.y - 0.10 * sz);  // upper-right
        ctx.lineTo(p.x + 0.10 * sz, p.y - 0.10 * sz);  // inner corner
        ctx.closePath();
        r._fillStroke(ctx, this);
    };
    return m;
}

interface StrikeEntry { timeMs: number; lat: number; lon: number; marker: L.CircleMarker; }

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

    private delayHistory: number[] = [];

    private map:          L.Map | null = null;
    private renderer!:    L.Canvas;
    private strikes:      StrikeEntry[] = [];
    private subs:         Subscription[] = [];
    private fadeTimer:    any;
    private rippleTimers: number[] = [];

    constructor(private svc: LightningService) {}

    ngOnInit(): void {}

    ngAfterViewInit(): void {
        setTimeout(() => {
            this.initMap();
            this.subs.push(
                this.svc.initialList().subscribe(list => list.forEach(s => this.flashStrike(s))),
                this.svc.newStrike().subscribe(s => this.flashStrike(s))
            );
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

        this.map.on('moveend zoomend', () => {
            this.mapZoom = this.map!.getZoom();
            this.updateCounts();
        });

        this.fadeTimer = setInterval(() => this.fade(), 10_000);
    }

    private flashStrike(strike: Strike): void {
        if (!this.map) return;

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
        const isLive      = !!strike.isNew && remainingMs > 0;

        const marker = boltMarker(
            [strike.lat, strike.lon],
            isLive ? STYLE_ACTIVE : STYLE_OLD,
            this.renderer
        ).addTo(this.map);

        this.strikes.push({ timeMs: strike.timeMs, lat: strike.lat, lon: strike.lon, marker });

        if (isLive) {
            this.drawRing(strike.lat, strike.lon, remainingMs);
            setTimeout(() => {
                marker.setStyle(STYLE_OLD);
                marker.setRadius(STYLE_OLD.radius);
                this.updateCounts();
            }, remainingMs);
        }

        this.updateCounts();
    }

    private drawRing(lat: number, lon: number, remainingMs: number): void {
        if (!this.map || this.map.getZoom() < 10) return;

        const startRadius = (RING_DURATION_MS - remainingMs) / 1000 * RING_SPEED;
        let radiusM = startRadius;

        const circle = L.circle([lat, lon], {
            radius: Math.max(1, radiusM), color: '#ffff00',
            weight: 3, fill: false, opacity: 1
        }).addTo(this.map);

        const timer = window.setInterval(() => {
            radiusM += RING_SPEED * RING_STEP_MS / 1000;
            if (radiusM >= RING_MAX_M) {
                circle.remove();
                clearInterval(timer);
                this.rippleTimers = this.rippleTimers.filter(t => t !== timer);
                return;
            }
            const progress = radiusM / RING_MAX_M;
            circle.setRadius(radiusM);
            circle.setStyle({ opacity: Math.max(0, 1 - progress), weight: Math.max(0.5, 3 * (1 - progress)) });
        }, RING_STEP_MS);

        this.rippleTimers.push(timer);
    }

    private fade(): void {
        const now  = Date.now();
        const dead: StrikeEntry[] = [];
        for (const s of this.strikes) {
            const age = now - s.timeMs;
            if (age > MAX_AGE_MS) {
                s.marker.remove();
                dead.push(s);
            } else {
                const opacity = 1 - age / MAX_AGE_MS;
                s.marker.setStyle({ fillOpacity: opacity, opacity });
            }
        }
        if (dead.length) this.strikes = this.strikes.filter(s => !dead.includes(s));
        this.updateCounts();
    }

    private updateCounts(): void {
        const now    = Date.now();
        const bounds = this.map?.getBounds();
        const active = this.strikes.filter(s => now - s.timeMs < ACTIVE_WINDOW_MS);
        this.activeCount   = active.length;
        this.viewportCount = bounds ? active.filter(s => bounds.contains([s.lat, s.lon])).length : 0;
        this.totalCount    = this.strikes.length;
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
        clearInterval(this.fadeTimer);
        this.rippleTimers.forEach(t => clearInterval(t));
        if (this.map) { this.map.remove(); this.map = null; }
    }
}
