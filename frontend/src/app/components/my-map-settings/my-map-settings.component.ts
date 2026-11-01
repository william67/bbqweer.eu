import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import * as L from 'leaflet';
import { LocalStorageService } from 'src/app/services/local-storage.service';
import {
    DEFAULT_WHEEL_PX, DEFAULT_ZOOM_STEP, LEAFLET_WHEEL_PX, WHEEL_MAX, WHEEL_MIN, WHEEL_STEP, ZOOM_STEPS, applyZoomPrefs
} from 'src/app/utils/map-view.util';

// The settings of a Leaflet map in one place: a gear button and a (not modal) dialog with the zoom step, the mouse wheel and, when the
// page has a layer on the map, its opacity. The component keeps the choices in the browser (LocalStorageService, under `storageKey`),
// puts the zoom settings on the map itself, and tells the page the opacity (`opacityChange`, also once at the start with the saved
// value) because only the page knows which layer that is. Usage, in the toolbar of the page:
//
//   <app-my-map-settings [map]="map" storageKey="mypage_settings" [showOpacity]="true" [defaultOpacity]="0.7"
//                        (opacityChange)="opacity = $event; updateLayer()"></app-my-map-settings>
//
// `map` is the Leaflet map as soon as the page has made it (null before); do not bind the opacity back to this component.
// Settings of the page itself go between the tags and appear in the dialog above the Reset button (see the rain radar: Area).
@Component({
    selector: 'app-my-map-settings',
    imports: [ButtonModule, DialogModule, TooltipModule],
    templateUrl: './my-map-settings.component.html',
    styleUrls: ['./my-map-settings.component.css']
})
export class MyMapSettingsComponent implements OnInit, OnChanges {

    @Input() map: L.Map | null | undefined;
    @Input() storageKey = '';                       // where this page keeps its settings in the browser
    @Input() showOpacity = false;                   // the page has a layer on the map whose opacity can be set
    @Input() defaultOpacity = 0.7;
    @Output() opacityChange = new EventEmitter<number>();

    visible = false;
    zoomSteps = ZOOM_STEPS;
    zoomStep = DEFAULT_ZOOM_STEP;
    wheelPx = DEFAULT_WHEEL_PX;
    opacity = 0.7;
    readonly wheelMin = WHEEL_MIN;
    readonly wheelMax = WHEEL_MAX;
    readonly wheelStep = WHEEL_STEP;

    constructor(private storage: LocalStorageService) {}

    get tooltip(): string {
        return this.showOpacity ? 'Settings: opacity and zoom' : 'Settings: zoom';
    }

    get wheelLabel(): string {
        return this.wheelPx === LEAFLET_WHEEL_PX ? 'standard' : this.wheelPx + ' px per level';
    }

    ngOnInit(): void {
        this.opacity = this.defaultOpacity;
        this.load();
        if (this.showOpacity && this.opacity !== this.defaultOpacity) this.opacityChange.emit(this.opacity);   // the page gets the saved value
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['map'] && this.map) applyZoomPrefs(this.map, { zoomStep: this.zoomStep, wheelPx: this.wheelPx });
    }

    onOpacity(event: Event): void {
        this.opacity = +(event.target as HTMLInputElement).value;
        this.opacityChange.emit(this.opacity);
        this.save();
    }

    setZoomStep(step: number): void {
        this.zoomStep = step;
        this.apply();
        this.save();
    }

    onWheel(event: Event): void {
        this.wheelPx = +(event.target as HTMLInputElement).value;
        this.apply();
        this.save();
    }

    reset(): void {
        this.zoomStep = DEFAULT_ZOOM_STEP;
        this.wheelPx = DEFAULT_WHEEL_PX;
        this.opacity = this.defaultOpacity;
        this.apply();
        if (this.showOpacity) this.opacityChange.emit(this.opacity);
        this.save();
    }

    private apply(): void {
        if (this.map) applyZoomPrefs(this.map, { zoomStep: this.zoomStep, wheelPx: this.wheelPx });
    }

    // The stored values are checked: a value that is not usable leaves the default
    private load(): void {
        if (!this.storageKey) return;
        try {
            const raw = this.storage.getData(this.storageKey);
            if (!raw) return;
            const s = JSON.parse(raw);
            if (typeof s.opacity === 'number' && s.opacity >= 0.2 && s.opacity <= 1) this.opacity = s.opacity;
            if (ZOOM_STEPS.includes(s.zoomStep)) this.zoomStep = s.zoomStep;
            if (typeof s.wheelPx === 'number' && s.wheelPx >= WHEEL_MIN && s.wheelPx <= WHEEL_MAX) this.wheelPx = s.wheelPx;
        } catch {
            // unreadable: the defaults stay
        }
    }

    private save(): void {
        if (!this.storageKey) return;
        try {
            this.storage.saveData(this.storageKey, JSON.stringify({ opacity: this.opacity, zoomStep: this.zoomStep, wheelPx: this.wheelPx }));
        } catch {
            // storage not available (private window): the settings just are not kept
        }
    }
}
