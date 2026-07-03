import { Component, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { Table } from 'primeng/table';
import { AuthService } from 'src/app/services/auth.service';
import { MessageServiceWrapper } from 'src/app/services/message.service';
import { FileAreasService, FileArea, AreaPoint } from 'src/app/services/file-areas.service';
import { TomtomService, TomtomIncident } from 'src/app/services/tomtom.service';

// Matches the backend cache refresh cadence (backend/helpers/tomtom.helper.js) — polling
// faster would just re-fetch the same cached data.
const TOMTOM_REFRESH_MS = 2 * 60 * 1000;

// Matches backend/tasks/file-area-incidents.js's own recompute cadence — polling faster
// would just re-fetch the same incidentCount values.
const AREAS_LIST_REFRESH_MS = 15 * 1000;

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

    private areasLayerGroup: L.LayerGroup = L.layerGroup();
    private loadedAreas = new Map<number, L.Polygon>();
    private loadedAreaData = new Map<number, FileArea>();
    private svgRenderer = L.svg({ padding: 5 });

    allAreas: FileArea[] = [];
    areasListDialogVisible = false;
    loadingAreas = false;
    private areasListRefreshTimer: any;

    // Area incidents dialog (opened by clicking the Filemeldingen count)
    areaIncidentsDialogVisible = false;
    areaIncidentsForArea: FileArea | null = null;
    areaIncidents: TomtomIncident[] = [];
    loadingAreaIncidents = false;

    // Area click menu + edit dialog
    selectedArea: FileArea | null = null;
    areaClickMenuVisible = false;
    editAreaDialogVisible = false;
    editAreaName = '';
    editAreaDescription = '';
    editAreaColor = '3388ff';
    savingEditArea = false;

    // Unified area edit mode (draw new + reshape existing)
    areaEditMode = false;
    areaEditIsNew = true;
    areaEditPoints: L.LatLng[] = [];
    private areaEditAreaId: number | null = null;
    private areaEditHandles: L.Marker[] = [];
    private areaEditMidHandles: L.Marker[] = [];
    private areaEditPreviewPolygon: L.Polygon | null = null;

    // Area save dialog
    areaDialogVisible = false;
    newAreaName = '';
    newAreaDescription = '';
    newAreaColor = '3388ff';
    savingArea = false;

    // TomTom incidents — always on, live, upsert-based (no clear+redraw, so no flash on refresh)
    private tomtomLayerGroup: L.LayerGroup = L.layerGroup();
    private tomtomIncidents = new Map<string, TomtomIncident>();
    private tomtomLayers = new Map<string, L.GeoJSON>();
    private tomtomRefreshTimer: any;

    private authSub?: Subscription;

    constructor(
        public authService: AuthService,
        private messageServiceWrapper: MessageServiceWrapper,
        private areasService: FileAreasService,
        private tomtomService: TomtomService
    ) {}

    ngAfterViewInit() {
        setTimeout(() => this.initMap());
        this.authSub = this.authService.authChanged$.subscribe(() => this.onAuthChanged());
    }

    private onAuthChanged() {
        if (this.authService.isLoggedIn) {
            this.loadAreas();
        } else {
            this.loadedAreas.forEach(polygon => polygon.remove());
            this.loadedAreas.clear();
            this.loadedAreaData.clear();
            this.allAreas = [];
            this.areasListDialogVisible = false;
            this.areaIncidentsDialogVisible = false;
            clearInterval(this.areasListRefreshTimer);
            if (this.areaEditMode) this.cancelAreaEdit();
        }
    }

    private initMap() {
        if (this.map) return;
        const bboxCenter: L.LatLngTuple = [
            (TOMTOM_BBOX.minLat + TOMTOM_BBOX.maxLat) / 2,
            (TOMTOM_BBOX.minLng + TOMTOM_BBOX.maxLng) / 2
        ];
        this.map = L.map(this.mapEl.nativeElement, { center: bboxCenter, zoom: 11 });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 20
        }).addTo(this.map);

        this.map.on('click', (e: L.LeafletMouseEvent) => {
            if (this.areaEditMode) this.addAreaEditPoint(e.latlng);
        });

        this.areasLayerGroup.addTo(this.map);
        this.tomtomLayerGroup.addTo(this.map);

        L.rectangle(
            [[TOMTOM_BBOX.minLat, TOMTOM_BBOX.minLng], [TOMTOM_BBOX.maxLat, TOMTOM_BBOX.maxLng]],
            { color: '#3b82f6', weight: 1.5, dashArray: '6 4', fill: true, fillOpacity: 0.04, renderer: this.svgRenderer }
        ).addTo(this.map);

        this.loadTomtomIncidents();
        this.tomtomRefreshTimer = setInterval(() => this.loadTomtomIncidents(), TOMTOM_REFRESH_MS);

        if (this.authService.isLoggedIn) this.loadAreas();
    }

    // ── TomTom incidents ─────────────────────────────────────────────────────

    private loadTomtomIncidents() {
        if (!this.map) return;
        this.tomtomService.getIncidents(TOMTOM_BBOX.minLat, TOMTOM_BBOX.maxLat, TOMTOM_BBOX.minLng, TOMTOM_BBOX.maxLng).subscribe({
            next: (response) => this.upsertTomtomIncidents(response.incidents),
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

    private loadAreas() {
        this.loadingAreas = true;
        this.areasService.getAreas().subscribe({
            next: (areas: FileArea[]) => {
                this.loadingAreas = false;
                this.loadedAreas.forEach(polygon => polygon.remove());
                this.loadedAreas.clear();
                this.loadedAreaData.clear();

                areas.forEach(area => {
                    const polygon = this.createAreaPolygon(area);
                    polygon.addTo(this.areasLayerGroup);
                    this.loadedAreas.set(area.id!, polygon);
                    this.loadedAreaData.set(area.id!, area);
                });
                this.allAreas = areas;
            },
            error: (err) => {
                this.loadingAreas = false;
                console.error('[FILE-AREAS] load error:', err);
            }
        });
    }

    // ── Area polygon factory ──────────────────────────────────────────────────

    private createAreaPolygon(area: FileArea): L.Polygon {
        const latlngs = area.points.map(p => [p.lat, p.lng] as L.LatLngTuple);
        const polygon = L.polygon(latlngs, {
            color: area.color,
            fillColor: area.color,
            fillOpacity: 0.2,
            weight: 2,
            renderer: this.svgRenderer
        }).bindTooltip(area.name, { permanent: false, direction: 'center' });
        polygon.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            this.onAreaClick(area.id!);
        });
        return polygon;
    }

    // ── Unified area edit mode (draw + reshape) ───────────────────────────────

    startDrawMode() {
        this.areaEditIsNew = true;
        this.areaEditAreaId = null;
        this.areaEditPoints = [];
        this.areaEditMode = true;
        this.map?.getContainer().classList.add('draw-cursor');
    }

    onAreaReshape() {
        this.areaClickMenuVisible = false;
        const area = this.selectedArea!;
        this.areaEditIsNew = false;
        this.areaEditAreaId = area.id!;
        this.areaEditPoints = area.points.map(p => L.latLng(p.lat, p.lng));
        this.areaEditMode = true;
        this.map?.getContainer().classList.add('draw-cursor');

        this.loadedAreas.get(area.id!)?.setStyle({ opacity: 0, fillOpacity: 0 });

        this.updateAreaEditPreview();
        this.rebuildAllHandles();
    }

    addAreaEditPoint(latlng: L.LatLng) {
        const i = this.areaEditPoints.length;
        this.areaEditPoints.push(latlng);
        const icon = L.divIcon({ className: 'reshape-handle', iconSize: [12, 12], iconAnchor: [6, 6] });
        this.createAreaEditHandle(latlng, i, icon);
        this.updateAreaEditPreview();
        this.rebuildMidpointHandles();
    }

    private createAreaEditHandle(latlng: L.LatLng, index: number, icon: L.DivIcon) {
        const handle = L.marker(latlng, { draggable: true, icon }).addTo(this.map!);
        const ref = { index };
        handle.on('drag', () => {
            this.areaEditPoints[ref.index] = handle.getLatLng();
            this.updateAreaEditPreview();
        });
        handle.on('dragend', () => this.rebuildMidpointHandles());
        handle.on('contextmenu', (e) => {
            L.DomEvent.stopPropagation(e);
            if (this.areaEditPoints.length <= 3) return;
            this.areaEditPoints.splice(ref.index, 1);
            this.rebuildAllHandles();
            this.updateAreaEditPreview();
        });
        this.areaEditHandles.push(handle);
    }

    private rebuildAllHandles() {
        this.areaEditHandles.forEach(h => h.remove());
        this.areaEditHandles = [];
        this.areaEditMidHandles.forEach(h => h.remove());
        this.areaEditMidHandles = [];

        const icon = L.divIcon({ className: 'reshape-handle', iconSize: [12, 12], iconAnchor: [6, 6] });
        this.areaEditPoints.forEach((p, i) => this.createAreaEditHandle(p, i, icon));
        this.rebuildMidpointHandles();
    }

    private rebuildMidpointHandles() {
        this.areaEditMidHandles.forEach(h => h.remove());
        this.areaEditMidHandles = [];

        const n = this.areaEditPoints.length;
        if (n < 2) return;

        const icon = L.divIcon({ className: 'midpoint-handle', iconSize: [8, 8], iconAnchor: [4, 4] });
        for (let i = 0; i < n; i++) {
            const p1 = this.areaEditPoints[i];
            const p2 = this.areaEditPoints[(i + 1) % n];
            const mid = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);
            this.createMidpointHandle(mid, i, icon);
        }
    }

    private createMidpointHandle(latlng: L.LatLng, insertAfterIndex: number, icon: L.DivIcon) {
        const handle = L.marker(latlng, { draggable: true, icon }).addTo(this.map!);
        let insertedIndex = -1;

        handle.on('dragstart', () => {
            insertedIndex = insertAfterIndex + 1;
            this.areaEditPoints.splice(insertedIndex, 0, handle.getLatLng());
            this.updateAreaEditPreview();
        });
        handle.on('drag', () => {
            if (insertedIndex !== -1) {
                this.areaEditPoints[insertedIndex] = handle.getLatLng();
                this.updateAreaEditPreview();
            }
        });
        handle.on('dragend', () => this.rebuildAllHandles());

        this.areaEditMidHandles.push(handle);
    }

    private updateAreaEditPreview() {
        const color = '#' + (this.areaEditIsNew
            ? this.newAreaColor
            : (this.loadedAreaData.get(this.areaEditAreaId!)?.color ?? '#3388ff').replace('#', ''));

        if (this.areaEditPreviewPolygon) {
            this.areaEditPreviewPolygon.setLatLngs(this.areaEditPoints);
        } else if (this.areaEditPoints.length >= 2) {
            this.areaEditPreviewPolygon = L.polygon(this.areaEditPoints, {
                color, fillColor: color, fillOpacity: 0.2, weight: 2, dashArray: '6, 6'
            }).addTo(this.map!);
        }
    }

    undoLastAreaEditPoint() {
        if (this.areaEditPoints.length === 0) return;
        this.areaEditPoints.pop();
        const handle = this.areaEditHandles.pop();
        handle?.remove();
        if (this.areaEditPreviewPolygon) {
            if (this.areaEditPoints.length < 2) {
                this.areaEditPreviewPolygon.remove();
                this.areaEditPreviewPolygon = null;
            } else {
                this.areaEditPreviewPolygon.setLatLngs(this.areaEditPoints);
            }
        }
        this.rebuildMidpointHandles();
    }

    finishAreaEdit() {
        if (this.areaEditIsNew) {
            this.newAreaName = '';
            this.newAreaDescription = '';
            this.areaDialogVisible = true;
        } else {
            this.saveReshape();
        }
    }

    cancelAreaEdit() {
        if (!this.areaEditIsNew && this.areaEditAreaId !== null) {
            const polygon = this.loadedAreas.get(this.areaEditAreaId);
            const area = this.loadedAreaData.get(this.areaEditAreaId);
            if (polygon && area) {
                polygon.setStyle({ opacity: 1, color: area.color, fillColor: area.color, fillOpacity: 0.2 });
            }
        }
        this.clearAreaEditMode();
    }

    private saveReshape() {
        const points: AreaPoint[] = this.areaEditPoints.map(p => ({ lat: p.lat, lng: p.lng }));
        this.areasService.updateAreaPoints(this.areaEditAreaId!, points).subscribe({
            next: (response) => {
                const updated: FileArea = response.updatedRecord;
                this.clearAreaEditMode();
                this.messageServiceWrapper.showMessage('success', 'Opgeslagen', 'Vorm van ' + updated.name + ' bijgewerkt');
                this.loadAreas();
            },
            error: (err) => this.messageServiceWrapper.showMessage('error', 'Opslaan mislukt', err.message ?? err)
        });
    }

    cancelAreaDialog() {
        this.areaDialogVisible = false;
    }

    saveArea() {
        if (!this.newAreaName) return;
        this.savingArea = true;
        const area: FileArea = {
            name: this.newAreaName,
            description: this.newAreaDescription || null,
            color: '#' + this.newAreaColor,
            points: this.areaEditPoints.map(p => ({ lat: p.lat, lng: p.lng }))
        };
        this.areasService.createArea(area).subscribe({
            next: (response) => {
                this.savingArea = false;
                this.areaDialogVisible = false;
                this.clearAreaEditMode();
                const saved: FileArea = response.insertedRecord;
                this.messageServiceWrapper.showMessage('success', 'Opgeslagen', 'Gebied ' + saved.name + ' opgeslagen');
                this.loadAreas();
            },
            error: (err) => {
                this.savingArea = false;
                this.messageServiceWrapper.showMessage('error', 'Opslaan mislukt', err.message ?? err);
            }
        });
    }

    private clearAreaEditMode() {
        this.areaEditHandles.forEach(h => h.remove());
        this.areaEditHandles = [];
        this.areaEditMidHandles.forEach(h => h.remove());
        this.areaEditMidHandles = [];
        if (this.areaEditPreviewPolygon) {
            this.areaEditPreviewPolygon.remove();
            this.areaEditPreviewPolygon = null;
        }
        this.areaEditMode = false;
        this.areaEditIsNew = true;
        this.areaEditAreaId = null;
        this.areaEditPoints = [];
        this.map?.getContainer().classList.remove('draw-cursor');
    }

    // ── Area click menu ───────────────────────────────────────────────────────

    onAreaClick(id: number) {
        if (this.areaEditMode || !this.authService.isLoggedIn) return;
        this.selectedArea = this.loadedAreaData.get(id) ?? null;
        if (this.selectedArea) this.areaClickMenuVisible = true;
    }

    onAreaMenuCancel() {
        this.areaClickMenuVisible = false;
    }

    onAreaEdit() {
        this.areaClickMenuVisible = false;
        this.editAreaName = this.selectedArea!.name;
        this.editAreaDescription = this.selectedArea!.description ?? '';
        this.editAreaColor = (this.selectedArea!.color ?? '#3388ff').replace('#', '');
        this.editAreaDialogVisible = true;
    }

    saveAreaEdit() {
        if (!this.editAreaName) return;
        this.savingEditArea = true;
        this.areasService.updateArea(this.selectedArea!.id!, {
            name: this.editAreaName,
            description: this.editAreaDescription || null,
            color: '#' + this.editAreaColor
        }).subscribe({
            next: () => {
                this.savingEditArea = false;
                this.editAreaDialogVisible = false;
                this.messageServiceWrapper.showMessage('success', 'Opgeslagen', 'Gebied bijgewerkt');
                this.loadAreas();
            },
            error: (err) => {
                this.savingEditArea = false;
                this.messageServiceWrapper.showMessage('error', 'Opslaan mislukt', err.message ?? err);
            }
        });
    }

    onAreaDelete() {
        this.areaClickMenuVisible = false;
        this.areasService.deleteArea(this.selectedArea!.id!).subscribe({
            next: () => {
                this.selectedArea = null;
                this.messageServiceWrapper.showMessage('success', 'Verwijderd', 'Gebied verwijderd');
                this.loadAreas();
            },
            error: (err) => this.messageServiceWrapper.showMessage('error', 'Verwijderen mislukt', err.message ?? err)
        });
    }

    // ── List dialog ────────────────────────────────────────────────────────────

    showAreasListDialog() {
        this.areasListDialogVisible = !this.areasListDialogVisible;
        if (this.areasListDialogVisible) {
            this.refreshAreasList();
            this.areasListRefreshTimer = setInterval(() => this.refreshAreasList(), AREAS_LIST_REFRESH_MS);
        } else {
            clearInterval(this.areasListRefreshTimer);
        }
    }

    // Lightweight refresh for the list dialog's incidentCount column only — does not
    // touch the map's polygon layers, so no flash on the map while polling.
    private refreshAreasList() {
        this.areasService.getAreas().subscribe({
            next: (areas: FileArea[]) => { this.allAreas = areas; },
            error: (err) => console.error('[FILE-AREAS] list refresh error:', err)
        });
    }

    onAreaListRowClick(area: FileArea) {
        const polygon = this.loadedAreas.get(area.id!);
        if (polygon) {
            this.map?.fitBounds(polygon.getBounds(), { padding: [40, 40] });
        }
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

    onGlobalFilter(table: Table, event: Event) {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    ngOnDestroy(): void {
        this.clearAreaEditMode();
        clearInterval(this.tomtomRefreshTimer);
        clearInterval(this.areasListRefreshTimer);
        this.authSub?.unsubscribe();
        this.map?.remove();
    }
}
