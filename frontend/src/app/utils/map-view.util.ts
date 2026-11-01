// What every Leaflet page needs and used to write for itself (the radar, the weather charts; the other pages may follow):
// the zoom settings, the container that changes size, and the saved position of the map. Pure functions, no Angular
// (the storage service is passed in), see components/my-map-settings for the settings button and dialog.

import * as L from 'leaflet';

// ---- zoom settings

export const ZOOM_STEPS = [1, 0.5, 0.25, 0.1];      // Leaflet zoomSnap and zoomDelta: where the map may stop and the step of + and -
export const DEFAULT_ZOOM_STEP = 0.25;
export const DEFAULT_WHEEL_PX = 120;                // pixels of mouse wheel per zoom level: a higher number is a finer wheel
export const LEAFLET_WHEEL_PX = 60;                 // the value Leaflet itself uses
export const WHEEL_MIN = 30;
export const WHEEL_MAX = 300;
export const WHEEL_STEP = 10;

export interface MapZoomPrefs {
    zoomStep: number;
    wheelPx: number;
}

// Leaflet reads these options at the moment of every zoom, so they can be changed while the map is shown
export function applyZoomPrefs(map: L.Map, prefs: MapZoomPrefs): void {
    map.options.zoomSnap = prefs.zoomStep;
    map.options.zoomDelta = prefs.zoomStep;
    map.options.wheelPxPerZoomLevel = prefs.wheelPx;
    map.setZoom(map.getZoom());                      // settle on the new grid of zoom levels
}

// ---- the container changes size

// The container can change size without a window resize event (the window moved to a bigger screen, the sidebar, the layout):
// without this Leaflet keeps loading tiles for the old size and the rest of the map stays grey. Returns the function that stops it.
export function watchResize(map: L.Map, el: HTMLElement): () => void {
    setTimeout(() => map.invalidateSize(), 0);       // the container gets its final size after the first render
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
}

// ---- the saved position of the map

// The storage service (LocalStorageService) is passed in, so this file has no dependencies on Angular
export interface MapStorage {
    getData(key: string): string;
    saveData(key: string, value: string): void;
}

export interface SavedView {
    lat: number;
    lng: number;
    zoom: number;
    [extra: string]: any;                            // what a page keeps next to the position: the layer, satellite on or off, ...
}

// The saved view, or null when there is none or it cannot be used (old, broken, storage blocked)
export function loadView(storage: MapStorage, key: string, minZoom = 0, maxZoom = 22): SavedView | null {
    try {
        const raw = storage.getData(key);
        if (!raw) return null;
        const v = JSON.parse(raw);
        if (![v.lat, v.lng, v.zoom].every(x => typeof x === 'number' && isFinite(x)) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return null;
        return { ...v, zoom: Math.min(maxZoom, Math.max(minZoom, v.zoom)) };
    } catch {
        return null;
    }
}

// Saves the position and zoom of the map, and the `extra` choices of the page; a failure (storage blocked) is silent: the map just
// starts on its default position next time
export function saveView(storage: MapStorage, key: string, map: L.Map, extra: Record<string, any> = {}): void {
    try {
        const c = map.getCenter();
        storage.saveData(key, JSON.stringify({ lat: +c.lat.toFixed(4), lng: +c.lng.toFixed(4), zoom: map.getZoom(), ...extra }));
    } catch {
        // nothing to do
    }
}

// The extra choices of a page that are saved with the view, read back with their kind checked: a value that is not the right kind is left out
export function pickExtra<T extends Record<string, (v: any) => boolean>>(view: SavedView | null, checks: T): Partial<Record<keyof T, any>> {
    const out: Partial<Record<keyof T, any>> = {};
    if (!view) return out;
    for (const key of Object.keys(checks) as (keyof T)[]) {
        if (checks[key](view[key as string])) out[key] = view[key as string];
    }
    return out;
}
