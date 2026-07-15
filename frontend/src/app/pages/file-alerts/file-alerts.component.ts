import { Component, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { AuthService } from 'src/app/services/auth.service';
import { MessageServiceWrapper } from 'src/app/services/message.service';
import { FileArea, FileAreasService } from 'src/app/services/file-areas.service';
import { TomtomService, TomtomIncident } from 'src/app/services/tomtom.service';
import { NtfyService } from 'src/app/services/ntfy.service';

// Matches the backend cache refresh cadence (backend/helpers/tomtom.helper.js, 10 min
// 07:00-19:00 Amsterdam time) — polling faster would just re-fetch the same cached data.
const TOMTOM_REFRESH_MS = 10 * 60 * 1000;

// iconCategory -> color, per docs/tomtom.md's confirmed category table
const TOMTOM_CATEGORY_COLOR: Record<number, string> = {
    1: '#dc2626',  // Accident
    6: '#dc2626',  // Jam
    9: '#f59e0b',  // RoadWorks
    8: '#6b7280',  // RoadClosed
    7: '#6b7280',  // LaneClosed
};
const TOMTOM_DEFAULT_COLOR = '#3b82f6';

// iconCategory -> name, per docs/tomtom.md's confirmed category table
const TOMTOM_CATEGORY_NAME: Record<number, string> = {
    0: 'Onbekend', 1: 'Ongeval', 2: 'Mist', 3: 'Gevaarlijke omstandigheden', 4: 'Regen',
    5: 'IJzel', 6: 'File', 7: 'Rijstrook afgesloten', 8: 'Weg afgesloten', 9: 'Wegwerkzaamheden',
    10: 'Wind', 11: 'Overstroming', 14: 'Autopech'
};
const TOMTOM_MAGNITUDE_NAME: Record<number, string> = {
    0: 'Onbekend', 1: 'Klein', 2: 'Matig', 3: 'Groot', 4: 'Onbepaald'
};

// TomTom's bbox is capped at 10,000km² — the current map viewport can easily exceed that
// when zoomed out, so query a fixed area instead until per-area querying is built (see
// docs/tomtom.md "Next steps"). Covers Rotterdam-Den Haag-Delft plus the Maasvlakte (~2400km²).
const TOMTOM_BBOX = { minLat: 51.80, maxLat: 52.15, minLng: 3.90, maxLng: 4.80 };

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl:       'assets/leaflet/marker-icon.png',
    iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
    shadowUrl:     'assets/leaflet/marker-shadow.png',
});

@Component({
    selector: 'app-file-alerts',
    templateUrl: './file-alerts.component.html',
    styleUrls: ['./file-alerts.component.css'],
    standalone: false
})
export class FileAlertsComponent implements AfterViewInit, OnDestroy {

    @ViewChild('mapEl') mapEl!: ElementRef;

    map: L.Map | undefined;
    mapZoom = 11;
    showSatellite = false;
    lastRefreshMs: number | null = null;
    tomtomError: string | null = null;

    private _formatMs(ms: number): string {
        const d     = new Date(ms);
        const today = new Date();
        const time  = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const sameDay = d.getDate()     === today.getDate()     &&
                        d.getMonth()    === today.getMonth()    &&
                        d.getFullYear() === today.getFullYear();
        return sameDay ? time : d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) + ' ' + time;
    }
    get lastRefreshTime(): string { return this.lastRefreshMs ? this._formatMs(this.lastRefreshMs) : ''; }

    private svgRenderer = L.svg({ padding: 5 });
    private streetLayer!: L.TileLayer;
    private satelliteLayer!: L.TileLayer;

    // Area incidents dialog (opened by clicking the Filemeldingen count in the area-manager's list)
    areaIncidentsDialogVisible = false;
    areaIncidentsForArea: FileArea | null = null;
    areaIncidents: TomtomIncident[] = [];
    loadingAreaIncidents = false;

    // TomTom incidents — always on, live, upsert-based (no clear+redraw, so no flash on refresh)
    private tomtomLayerGroup: L.LayerGroup = L.layerGroup();
    private tomtomIncidents = new Map<string, TomtomIncident>();
    private tomtomLayers = new Map<string, L.GeoJSON>();
    private tomtomRefreshTimer: any;
    private authSub?: Subscription;

    constructor(
        public authService: AuthService,
        private messageServiceWrapper: MessageServiceWrapper,
        private tomtomService: TomtomService,
        private ntfyService: NtfyService,
        public areasService: FileAreasService
    ) {}

    ngAfterViewInit() {
        setTimeout(() => this.initMap());
        this.authSub = this.authService.authChanged$.subscribe(() => {
            if (!this.authService.isLoggedIn) this.areaIncidentsDialogVisible = false;
        });
    }

    private initMap() {
        if (this.map) return;
        const bboxCenter: L.LatLngTuple = [
            (TOMTOM_BBOX.minLat + TOMTOM_BBOX.maxLat) / 2,
            (TOMTOM_BBOX.minLng + TOMTOM_BBOX.maxLng) / 2
        ];
        this.map = L.map(this.mapEl.nativeElement, { center: bboxCenter, zoom: 11 });

        this.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 20
        });
        this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri'
        });
        this.streetLayer.addTo(this.map);

        this.tomtomLayerGroup.addTo(this.map);

        L.rectangle(
            [[TOMTOM_BBOX.minLat, TOMTOM_BBOX.minLng], [TOMTOM_BBOX.maxLat, TOMTOM_BBOX.maxLng]],
            { color: '#3b82f6', weight: 1.5, dashArray: '6 4', fill: true, fillOpacity: 0.04, renderer: this.svgRenderer }
        ).addTo(this.map);

        this.map.on('zoomend', () => { this.mapZoom = this.map!.getZoom(); });

        this.loadTomtomIncidents();
        this.tomtomRefreshTimer = setInterval(() => this.loadTomtomIncidents(), TOMTOM_REFRESH_MS);
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

    // ── TomTom incidents ─────────────────────────────────────────────────────

    private loadTomtomIncidents() {
        if (!this.map) return;
        this.tomtomService.getIncidents(TOMTOM_BBOX.minLat, TOMTOM_BBOX.maxLat, TOMTOM_BBOX.minLng, TOMTOM_BBOX.maxLng).subscribe({
            next: (response) => {
                this.upsertTomtomIncidents(response.incidents);
                this.lastRefreshMs = response.lastRefreshMs;
                this.tomtomError = response.lastError;
            },
            error: (err) => {
                console.error('[TOMTOM] load error:', err);
                this.messageServiceWrapper.showMessage('error', 'Laden mislukt', err.message ?? err);
            }
        });
    }

    private upsertTomtomIncidents(incidents: TomtomIncident[]) {
        const incomingIds = new Set(incidents.map(i => i.properties.id));

        this.tomtomLayers.forEach((layer, id) => {
            if (!incomingIds.has(id)) {
                layer.remove();
                this.tomtomLayers.delete(id);
                this.tomtomIncidents.delete(id);
            }
        });

        incidents.forEach(incident => {
            const id = incident.properties.id;
            this.tomtomIncidents.set(id, incident);

            const existing = this.tomtomLayers.get(id);
            if (existing) {
                const color = TOMTOM_CATEGORY_COLOR[incident.properties.iconCategory] ?? TOMTOM_DEFAULT_COLOR;
                existing.setStyle({ color, weight: 4, opacity: 0.8 });
                existing.bindTooltip(this.tomtomTooltip(incident), { sticky: true });
            } else {
                this.addTomtomIncident(incident);
            }
        });
    }

    private addTomtomIncident(incident: TomtomIncident) {
        const color = TOMTOM_CATEGORY_COLOR[incident.properties.iconCategory] ?? TOMTOM_DEFAULT_COLOR;

        const layer = L.geoJSON(incident as any, {
            style: { color, weight: 4, opacity: 0.8 }
        }).bindTooltip(this.tomtomTooltip(incident), { sticky: true });

        layer.addTo(this.tomtomLayerGroup);
        this.tomtomLayers.set(incident.properties.id, layer);
    }

    private tomtomTooltip(incident: TomtomIncident): string {
        const p = incident.properties;
        const categoryName = TOMTOM_CATEGORY_NAME[p.iconCategory] ?? `Categorie ${p.iconCategory}`;
        const magnitudeName = TOMTOM_MAGNITUDE_NAME[p.magnitudeOfDelay] ?? String(p.magnitudeOfDelay);
        const events = p.events.map(e => `${e.description} (${e.code})`).join(', ');
        const start = p.startTime ? new Date(p.startTime).toLocaleString('nl-NL') : '-';
        const end = p.endTime ? new Date(p.endTime).toLocaleString('nl-NL') : 'onbekend';
        const roadNumbers = p.roadNumbers.length ? p.roadNumbers.join(', ') : '-';

        return `
            <div class="tomtom-tooltip">
                <strong>${p.from} → ${p.to}</strong><br>
                Categorie: ${categoryName} (${p.iconCategory})<br>
                Gebeurtenissen: ${events}<br>
                Vertraging: ${p.delay ?? 'onbekend'} — ernst: ${magnitudeName}<br>
                Lengte: ${Math.round(p.length)} m<br>
                Wegnummers: ${roadNumbers}<br>
                Geldigheid: ${p.timeValidity}<br>
                Start: ${start}<br>
                Eind: ${end}
            </div>
        `;
    }

    // ── Area incidents dialog ───────────────────────────────────────────────────

    showAreaIncidents(area: FileArea) {
        this.areaIncidentsForArea = area;
        this.areaIncidents = [];
        this.areaIncidentsDialogVisible = true;
        this.loadingAreaIncidents = true;
        this.areasService.getAreaIncidents(area.id!).subscribe({
            next: (incidents) => {
                this.loadingAreaIncidents = false;
                this.areaIncidents = incidents;
            },
            error: (err) => {
                this.loadingAreaIncidents = false;
                console.error('[FILE-AREAS] area incidents error:', err);
                this.messageServiceWrapper.showMessage('error', 'Laden mislukt', err.message ?? err);
            }
        });
    }

    closeAreaIncidentsDialog() {
        this.areaIncidentsDialogVisible = false;
    }

    areaIncidentCategoryName(iconCategory: number): string {
        return TOMTOM_CATEGORY_NAME[iconCategory] ?? `Categorie ${iconCategory}`;
    }

    sendTestMessage() {
        this.ntfyService.sendTest('traffic').subscribe({
            next: () => this.messageServiceWrapper.showMessage('success', 'Verstuurd', 'Testbericht ingepland'),
            error: (err) => this.messageServiceWrapper.showMessage('error', 'Mislukt', err.message ?? err)
        });
    }

    ngOnDestroy(): void {
        clearInterval(this.tomtomRefreshTimer);
        this.authSub?.unsubscribe();
        this.map?.remove();
    }
}
