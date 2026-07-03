import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { Table } from 'primeng/table';
import { AuthService } from 'src/app/services/auth.service';
import { MessageServiceWrapper } from 'src/app/services/message.service';
import { Area, AreaPoint, AreaCrudService } from 'src/app/services/area.types';

// Matches backend/tasks/file-area-incidents.js's own recompute cadence — only relevant
// when showIncidentCount is on (Filemeldingen), skipped otherwise (e.g. Bliksem).
const AREAS_LIST_REFRESH_MS = 15 * 1000;

// Draws/edits/lists area polygons on a host-provided Leaflet map, against a host-provided
// CRUD service. Shared between the Filemeldingen (FileAreasService / file_areas table) and
// Bliksem (StrikeAreasService / strike_areas table) pages — each page manages its own,
// separate set of areas. Host owns the map instance and any page-specific overlays (e.g.
// TomTom incidents); this component owns everything about the area polygons themselves.
@Component({
    selector: 'app-area-manager',
    templateUrl: './area-manager.component.html',
    styleUrls: ['./area-manager.component.css'],
    standalone: false
})
export class AreaManagerComponent implements OnChanges, OnDestroy {

    @Input() map: L.Map | null | undefined;
    @Input() areasService!: AreaCrudService;
    @Input() showIncidentCount = false;
    @Output() incidentClick = new EventEmitter<Area>();

    private areasLayerGroup: L.LayerGroup = L.layerGroup();
    private loadedAreas = new Map<number, L.Polygon>();
    private loadedAreaData = new Map<number, Area>();
    private svgRenderer = L.svg({ padding: 5 });
    private mapInitialized = false;

    allAreas: Area[] = [];
    areasListDialogVisible = false;
    loadingAreas = false;
    private areasListRefreshTimer: any;

    selectedArea: Area | null = null;
    areaClickMenuVisible = false;
    editAreaDialogVisible = false;
    editAreaName = '';
    editAreaDescription = '';
    editAreaColor = '3388ff';
    savingEditArea = false;

    areaEditMode = false;
    areaEditIsNew = true;
    areaEditPoints: L.LatLng[] = [];
    private areaEditAreaId: number | null = null;
    private areaEditHandles: L.Marker[] = [];
    private areaEditMidHandles: L.Marker[] = [];
    private areaEditPreviewPolygon: L.Polygon | null = null;

    areaDialogVisible = false;
    newAreaName = '';
    newAreaDescription = '';
    newAreaColor = '3388ff';
    savingArea = false;

    private authSub: Subscription;
    private mapClickHandler = (e: L.LeafletMouseEvent) => {
        if (this.areaEditMode) this.addAreaEditPoint(e.latlng);
    };

    constructor(
        public authService: AuthService,
        private messageServiceWrapper: MessageServiceWrapper
    ) {
        this.authSub = this.authService.authChanged$.subscribe(() => this.onAuthChanged());
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['map'] && this.map && !this.mapInitialized) {
            this.mapInitialized = true;
            this.areasLayerGroup.addTo(this.map);
            this.map.on('click', this.mapClickHandler);
            if (this.authService.isLoggedIn) this.loadAreas();
        }
    }

    private onAuthChanged() {
        if (this.authService.isLoggedIn) {
            if (this.mapInitialized) this.loadAreas();
        } else {
            this.loadedAreas.forEach(polygon => polygon.remove());
            this.loadedAreas.clear();
            this.loadedAreaData.clear();
            this.allAreas = [];
            this.areasListDialogVisible = false;
            clearInterval(this.areasListRefreshTimer);
            if (this.areaEditMode) this.cancelAreaEdit();
        }
    }

    private loadAreas() {
        this.loadingAreas = true;
        this.areasService.getAreas().subscribe({
            next: (areas: Area[]) => {
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
                console.error('[AREA-MANAGER] load error:', err);
            }
        });
    }

    // ── Area polygon factory ──────────────────────────────────────────────────

    private createAreaPolygon(area: Area): L.Polygon {
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
                const updated: Area = response.updatedRecord;
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
        const area: Area = {
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
                const saved: Area = response.insertedRecord;
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
            if (this.showIncidentCount) {
                this.areasListRefreshTimer = setInterval(() => this.refreshAreasList(), AREAS_LIST_REFRESH_MS);
            }
        } else {
            clearInterval(this.areasListRefreshTimer);
        }
    }

    // Lightweight refresh for the list dialog's incidentCount column only — does not
    // touch the map's polygon layers, so no flash on the map while polling.
    private refreshAreasList() {
        this.areasService.getAreas().subscribe({
            next: (areas: Area[]) => { this.allAreas = areas; },
            error: (err) => console.error('[AREA-MANAGER] list refresh error:', err)
        });
    }

    onAreaListRowClick(area: Area) {
        const polygon = this.loadedAreas.get(area.id!);
        if (polygon) {
            this.map?.fitBounds(polygon.getBounds(), { padding: [40, 40] });
        }
    }

    onGlobalFilter(table: Table, event: Event) {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    ngOnDestroy(): void {
        this.clearAreaEditMode();
        clearInterval(this.areasListRefreshTimer);
        this.authSub?.unsubscribe();
        if (this.map && this.mapInitialized) {
            this.map.off('click', this.mapClickHandler);
        }
        this.loadedAreas.forEach(p => p.remove());
        this.areasLayerGroup.remove();
    }
}
