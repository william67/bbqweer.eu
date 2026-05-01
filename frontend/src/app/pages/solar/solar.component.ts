import { Component, OnInit } from '@angular/core';
import { SolarService, SolarConfig, SolarForecast, SolarDay, Inverter, InverterType, PanelArray } from 'src/app/services/solar.service';

const STORAGE_KEY = 'solar_config_v3';

interface FullConfig {
    inverters:    Inverter[];
    lat:          number;
    lon:          number;
    lossInverter: number;
    lossWiring:   number;
    lossSoiling:  number;
    lossTemp:     number;
}

const DEFAULT: FullConfig = {
    inverters: [{
        name:   'Omvormer 1',
        type:   'string',
        maxAcW: 5000,
        arrays: [{ panels: 10, wp: 400, tilt: 35, azimuth: 0 }],
    }],
    lat:          52.09,
    lon:          5.18,
    lossInverter: 3,
    lossWiring:   2,
    lossSoiling:  2,
    lossTemp:     5,
};

const DEFAULT_ARRAY: PanelArray = { panels: 6, wp: 400, tilt: 35, azimuth: 0 };

@Component({
    selector: 'app-solar',
    templateUrl: './solar.component.html',
    styleUrls: ['./solar.component.scss'],
    standalone: false
})
export class SolarComponent implements OnInit {

    cfg: FullConfig = this.cloneDefault();

    loading           = false;
    errorMessage: string | null = null;
    result:       SolarForecast | null = null;
    selectedDayIndex  = 0;

    chartData:    any = null;
    chartOptions: any = null;

    expandedInverters: Record<number, boolean> = {};
    lossExpanded = false;
isInverterExpanded(ii: number): boolean {
        return this.expandedInverters[ii] ?? false;
    }

    toggleInverter(ii: number) {
        this.expandedInverters[ii] = !this.isInverterExpanded(ii);
    }

    toggleLoss() {
        this.lossExpanded = !this.lossExpanded;
    }

    constructor(private svc: SolarService) {}

    ngOnInit() {
        this.loadConfig();
        this.calculate();
    }

    private cloneDefault(): FullConfig {
        return {
            ...DEFAULT,
            inverters: DEFAULT.inverters.map(inv => ({
                ...inv,
                arrays: inv.arrays.map(a => ({ ...a })),
            })),
        };
    }

    // ── getters ────────────────────────────────────────────────────────────────

    get efficiency(): number {
        return (1 - this.cfg.lossInverter / 100)
             * (1 - this.cfg.lossWiring   / 100)
             * (1 - this.cfg.lossSoiling  / 100)
             * (1 - this.cfg.lossTemp     / 100);
    }

    get efficiencyPct(): string {
        return (this.efficiency * 100).toFixed(1) + '%';
    }

    get totalWp(): number {
        return this.cfg.inverters.reduce((s, inv) =>
            s + inv.arrays.reduce((as, a) => as + a.panels * a.wp, 0), 0);
    }

    get totalPanels(): number {
        return this.cfg.inverters.reduce((s, inv) =>
            s + inv.arrays.reduce((as, a) => as + a.panels, 0), 0);
    }

    get selectedDay(): SolarDay | null {
        return this.result?.days[this.selectedDayIndex] ?? null;
    }

    get dateLabel(): string {
        if (!this.selectedDay) return '';
        const d = new Date(this.selectedDay.date + 'T12:00:00');
        return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    }

    get peakW(): number {
        if (!this.selectedDay) return 0;
        return Math.max(...this.selectedDay.hourly.map(h => h.power_w));
    }

    get sunHours(): number {
        if (!this.selectedDay) return 0;
        return this.selectedDay.hourly.filter(h => h.energy_wh > 0).length;
    }

    // ── inverter helpers ───────────────────────────────────────────────────────

    invTotalWp(ii: number): number {
        return this.cfg.inverters[ii].arrays.reduce((s, a) => s + a.panels * a.wp, 0);
    }

    invTotalPanels(ii: number): number {
        return this.cfg.inverters[ii].arrays.reduce((s, a) => s + a.panels, 0);
    }

    setInverterType(ii: number, type: InverterType) {
        this.cfg.inverters[ii].type = type;
    }

    addInverter() {
        this.cfg.inverters = [...this.cfg.inverters, {
            name:   `Omvormer ${this.cfg.inverters.length + 1}`,
            type:   'string',
            maxAcW: 5000,
            arrays: [{ ...DEFAULT_ARRAY }],
        }];
    }

    removeInverter(ii: number) {
        if (this.cfg.inverters.length > 1) {
            this.cfg.inverters = this.cfg.inverters.filter((_, i) => i !== ii);
        }
    }

    addArray(ii: number) {
        const inv = this.cfg.inverters[ii];
        inv.arrays = [...inv.arrays, { ...DEFAULT_ARRAY }];
    }

    removeArray(ii: number, ai: number) {
        const inv = this.cfg.inverters[ii];
        if (inv.arrays.length > 1) {
            inv.arrays = inv.arrays.filter((_, i) => i !== ai);
        }
    }

    // ── day tabs ───────────────────────────────────────────────────────────────

    dayTabLabel(i: number): string {
        if (i === 0) return 'Vandaag';
        if (i === 1) return 'Morgen';
        return 'Overmorgen';
    }

    dayTabDate(dateStr: string): string {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    selectDay(i: number) {
        this.selectedDayIndex = i;
        if (this.result) this.buildChart(this.result.days[i]);
    }

    // ── config persistence ─────────────────────────────────────────────────────

    loadConfig() {
        try {
            const v3 = localStorage.getItem(STORAGE_KEY);
            if (v3) { this.cfg = { ...DEFAULT, ...JSON.parse(v3) }; return; }

            // Migrate from solar_config_v2 (arrays + maxAcW at top level)
            const v2str = localStorage.getItem('solar_config_v2');
            if (v2str) {
                const v2 = JSON.parse(v2str);
                this.cfg = {
                    ...DEFAULT,
                    lat:          v2.lat          ?? DEFAULT.lat,
                    lon:          v2.lon          ?? DEFAULT.lon,
                    lossInverter: v2.lossInverter ?? DEFAULT.lossInverter,
                    lossWiring:   v2.lossWiring   ?? DEFAULT.lossWiring,
                    lossSoiling:  v2.lossSoiling  ?? DEFAULT.lossSoiling,
                    lossTemp:     v2.lossTemp     ?? DEFAULT.lossTemp,
                    inverters: [{
                        name:   'Omvormer 1',
                        type:   'string' as InverterType,
                        maxAcW: v2.maxAcW ?? DEFAULT.inverters[0].maxAcW,
                        arrays: v2.arrays ?? DEFAULT.inverters[0].arrays,
                    }],
                };
            }
        } catch { /* use defaults */ }
    }

    saveConfig() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cfg));
    }

    resetDefaults() {
        this.cfg = this.cloneDefault();
        this.calculate();
    }

    // ── calculate ──────────────────────────────────────────────────────────────

    calculate() {
        this.saveConfig();
        this.loading      = true;
        this.errorMessage = null;

        const apiCfg: SolarConfig = {
            inverters:  this.cfg.inverters,
            lat:        this.cfg.lat,
            lon:        this.cfg.lon,
            efficiency: this.efficiency,
        };

        this.svc.getTomorrow(apiCfg).subscribe({
            next:  (data) => { this.loading = false; this.build(data); },
            error: (err)  => { this.loading = false; this.errorMessage = err.message || 'Fout bij ophalen voorspelling'; }
        });
    }

    private build(data: SolarForecast) {
        this.result = data;
        this.buildChart(data.days[this.selectedDayIndex]);
    }

    private buildChart(day: SolarDay) {
        const activeHours = day.hourly.filter(h => h.energy_wh > 0);
        const maxWh = activeHours.length ? Math.max(...activeHours.map(h => h.energy_wh)) : 1;

        this.chartData = {
            labels: day.hourly.map(h => `${String(h.hour).padStart(2, '0')}:00`),
            datasets: [{
                data:            day.hourly.map(h => h.energy_wh),
                backgroundColor: day.hourly.map(h => this.barColor(h.energy_wh, maxWh)),
                borderWidth:     1,
            }]
        };

        this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => {
                            const h = day.hourly[ctx.dataIndex];
                            const lines = [`${ctx.raw} Wh`];
                            if (h.gti_wm2 != null)   lines.push(`Straling: ${h.gti_wm2} W/m²`);
                            if (h.cloud_pct != null)  lines.push(`Bewolking: ${h.cloud_pct}%`);
                            if (h.temp_c != null)     lines.push(`Temp: ${h.temp_c} °C`);
                            return lines;
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Wh' },
                    ticks: { callback: (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)} kWh` : `${v} Wh` }
                },
                x: { grid: { display: false } }
            }
        };
    }

    private barColor(wh: number, maxWh: number): string {
        if (wh <= 0 || maxWh <= 0) return 'rgba(100, 116, 139, 0.3)';
        const ratio = wh / maxWh;
        if (ratio < 0.3)  return 'rgba(234, 179, 8, 0.5)';
        if (ratio < 0.6)  return 'rgba(234, 179, 8, 0.75)';
        if (ratio < 0.85) return 'rgba(249, 115, 22, 0.85)';
        return 'rgba(234, 88, 12, 0.95)';
    }

    formatWh(wh: number): string {
        return wh >= 1000 ? `${(wh / 1000).toFixed(2)} kWh` : `${wh} Wh`;
    }
}
