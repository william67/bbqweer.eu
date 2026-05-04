import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import * as L from 'leaflet';
import { HttpClient } from '@angular/common/http';
import { ForecastService } from 'src/app/services/forecast.service';
import { LocalStorageService } from 'src/app/services/local-storage.service';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl:       'assets/leaflet/marker-icon.png',
    iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
    shadowUrl:     'assets/leaflet/marker-shadow.png',
});

const WMO_LABELS: Record<number, string> = {
    0: 'Helder', 1: 'Overwegend helder', 2: 'Deels bewolkt', 3: 'Bewolkt',
    45: 'Mist', 48: 'IJsmist',
    51: 'Lichte motregen', 53: 'Motregen', 55: 'Zware motregen',
    61: 'Lichte regen', 63: 'Regen', 65: 'Zware regen',
    71: 'Lichte sneeuw', 73: 'Sneeuw', 75: 'Zware sneeuw', 77: 'Sneeuwkorrels',
    80: 'Lichte buien', 81: 'Buien', 82: 'Zware buien',
    85: 'Sneeuwbuien', 86: 'Zware sneeuwbuien',
    95: 'Onweer', 96: 'Onweer met hagel', 99: 'Onweer met zware hagel'
};

const WMO_ICON: Record<number, string> = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '❄️', 77: '❄️',
    80: '🌦️', 81: '🌧️', 82: '⛈️',
    85: '🌨️', 86: '❄️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
};

export const LOCATIONS = [
    { label: 'De Bilt',      lat: 52.10, lon: 5.18  },
    { label: 'Amsterdam',    lat: 52.37, lon: 4.90  },
    { label: 'Rotterdam',    lat: 51.92, lon: 4.48  },
    { label: 'Den Haag',     lat: 52.07, lon: 4.30  },
    { label: 'Utrecht',      lat: 52.09, lon: 5.12  },
    { label: 'Eindhoven',    lat: 51.44, lon: 5.48  },
    { label: 'Groningen',    lat: 53.22, lon: 6.57  },
    { label: 'Maastricht',   lat: 50.85, lon: 5.69  },
    { label: 'Vlissingen',   lat: 51.44, lon: 3.57  },
    { label: 'Den Helder',   lat: 52.96, lon: 4.76  },
];

const FORECAST_LOCATION_KEY = 'forecast_location';

@Component({
    selector: 'app-forecast',
    templateUrl: './forecast.component.html',
    styleUrls: ['./forecast.component.css'],
    standalone: false
})
export class ForecastComponent implements OnInit, OnDestroy {

    selectedLocation = LOCATIONS[0];

    loading  = false;
    errorMessage: string | null = null;

    hours: any[] = [];
    days:  any[] = [];
    selectedDay: string | null = null;

    mapDialogVisible = false;
    pendingLocation  = { ...LOCATIONS[0] };
    savingLocation   = false;
    private map: L.Map | null = null;
    private marker: L.Marker | null = null;
    @ViewChild('mapEl') mapEl!: ElementRef;

    constructor(private svc: ForecastService, private localStorage: LocalStorageService, private http: HttpClient) {}

    ngOnInit() {
        const stored = this.localStorage.getData(FORECAST_LOCATION_KEY);
        if (stored) {
            try {
                const loc = JSON.parse(stored);
                const preset = LOCATIONS.find(l => l.lat === loc.lat && l.lon === loc.lon);
                this.selectedLocation = preset ?? loc;
            } catch {}
        }
        this.load();
    }

    ngOnDestroy() {
        this.destroyMap();
    }

    load() {
        this.loading      = true;
        this.errorMessage = null;
        this.svc.getForecast(this.selectedLocation.lat, this.selectedLocation.lon).subscribe({
            next:  (data: any) => { this.loading = false; this.processData(data); },
            error: (err: any)  => { this.loading = false; this.errorMessage = err.message || 'Fout bij ophalen weersverwachting'; }
        });
    }

    openMapDialog() {
        this.pendingLocation = { ...this.selectedLocation };
        this.mapDialogVisible = true;
    }

    onMapDialogShow() {
        setTimeout(() => this.initMap());
    }

    onMapDialogHide() {
        this.destroyMap();
    }

    saveLocation() {
        this.savingLocation = true;
        const { lat, lon } = this.pendingLocation;
        this.http.get<any>(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=nl`
        ).subscribe({
            next: (data) => {
                const addr = data.address;
                const label = addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || `${lat}, ${lon}`;
                this.applyLocation({ label, lat, lon });
            },
            error: () => this.applyLocation({ label: `${lat}, ${lon}`, lat, lon })
        });
    }

    private applyLocation(loc: { label: string; lat: number; lon: number }) {
        this.selectedLocation = loc;
        this.localStorage.saveData(FORECAST_LOCATION_KEY, JSON.stringify(loc));
        this.savingLocation    = false;
        this.mapDialogVisible  = false;
        this.load();
    }

    cancelMap() {
        this.mapDialogVisible = false;
    }

    private initMap() {
        if (this.map) return;
        this.map = L.map(this.mapEl.nativeElement, {
            center: [this.pendingLocation.lat, this.pendingLocation.lon],
            zoom: 8
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        this.marker = L.marker([this.pendingLocation.lat, this.pendingLocation.lon], { draggable: true }).addTo(this.map);
        this.marker.on('dragend', () => {
            const pos = this.marker!.getLatLng();
            const lat = Math.round(pos.lat * 1000) / 1000;
            const lon = Math.round(pos.lng * 1000) / 1000;
            this.pendingLocation = { ...this.pendingLocation, lat, lon };
        });
        this.map.on('click', (e: L.LeafletMouseEvent) => {
            const lat = Math.round(e.latlng.lat * 1000) / 1000;
            const lon = Math.round(e.latlng.lng * 1000) / 1000;
            this.pendingLocation = { ...this.pendingLocation, lat, lon };
            this.marker!.setLatLng([lat, lon]);
        });
    }

    private destroyMap() {
        if (this.map) { this.map.remove(); this.map = null; this.marker = null; }
    }

    private processData(data: any) {
        const h = data.hourly;
        this.hours = h.time.map((t: string, i: number) => ({
            time:       t,
            date:       t.slice(0, 10),
            timeLabel:  t.slice(11, 16),
            temp:       h.temperature_2m[i],
            precip:     h.precipitation[i],
            wind:       h.windspeed_10m[i],
            windDir:    h.winddirection_10m[i],
            wmo:        h.weathercode[i],
            wmoLabel:   WMO_LABELS[h.weathercode[i]] ?? String(h.weathercode[i]),
            wmoIcon:    WMO_ICON[h.weathercode[i]] ?? '❓',
            clouds:     h.cloud_cover[i],
            radiation:  Math.round(h.global_tilted_irradiance[i]),
            humidity:   h.relativehumidity_2m[i],
            pressure:   h.pressure_msl[i],
            snow:       h.snowfall[i],
        }));

        const byDay: Record<string, any[]> = {};
        for (const row of this.hours) {
            if (!byDay[row.date]) byDay[row.date] = [];
            byDay[row.date].push(row);
        }
        this.days = Object.entries(byDay).map(([date, rows]) => ({
            date,
            dateLabel: new Date(date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }),
            tempMin:   Math.min(...rows.map((r: any) => r.temp)),
            tempMax:   Math.max(...rows.map((r: any) => r.temp)),
            precipSum: rows.reduce((s: number, r: any) => s + r.precip, 0),
            wmoIcon:   rows[Math.floor(rows.length / 2)].wmoIcon,
            wmoLabel:  rows[Math.floor(rows.length / 2)].wmoLabel,
        }));

        this.selectedDay = this.days[0]?.date ?? null;
    }

    get filteredHours(): any[] {
        return this.selectedDay ? this.hours.filter(h => h.date === this.selectedDay) : this.hours;
    }

    windDirLabel(deg: number): string {
        const dirs = ['N','NO','O','ZO','Z','ZW','W','NW'];
        return dirs[Math.round(deg / 45) % 8];
    }

    tempColor(temp: number): string {
        if (temp <= 0)  return '#93c5fd';
        if (temp <= 10) return '#6ee7b7';
        if (temp <= 20) return '#fde68a';
        if (temp <= 30) return '#f97316';
        return '#ef4444';
    }
}
