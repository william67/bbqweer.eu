import { Component, OnInit } from '@angular/core';
import { SolarService, SolarConfig, SolarTomorrow } from 'src/app/services/solar.service';

const STORAGE_KEY = 'solar_config';

interface FullConfig {
    panels:       number;
    wp:           number;
    tilt:         number;
    azimuth:      number;
    lat:          number;
    lon:          number;
    lossInverter: number;  // % e.g. 3
    lossWiring:   number;
    lossSoiling:  number;
    lossTemp:     number;
    maxAcW:       number;  // inverter AC limit in W, 0 = no clipping
}

const DEFAULT: FullConfig = {
    panels:       10,
    wp:           400,
    tilt:         35,
    azimuth:      0,
    lat:          52.09,
    lon:          5.18,
    lossInverter: 3,
    lossWiring:   2,
    lossSoiling:  2,
    lossTemp:     5,
    maxAcW:       5000,
};

@Component({
    selector: 'app-solar',
    templateUrl: './solar.component.html',
    styleUrls: ['./solar.component.scss'],
    standalone: false
})
export class SolarComponent implements OnInit {

    cfg: FullConfig = { ...DEFAULT };

    loading      = false;
    errorMessage: string | null = null;
    result:       SolarTomorrow | null = null;

    chartData:    any = null;
    chartOptions: any = null;
    dateLabel     = '';

    constructor(private svc: SolarService) {}

    ngOnInit() {
        this.loadConfig();
        this.calculate();
    }

    get efficiency(): number {
        return (1 - this.cfg.lossInverter / 100)
             * (1 - this.cfg.lossWiring   / 100)
             * (1 - this.cfg.lossSoiling  / 100)
             * (1 - this.cfg.lossTemp     / 100);
    }

    get efficiencyPct(): string {
        return (this.efficiency * 100).toFixed(1) + '%';
    }

    loadConfig() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) this.cfg = { ...DEFAULT, ...JSON.parse(stored) };
        } catch { /* use defaults */ }
    }

    saveConfig() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cfg));
    }

    resetDefaults() {
        this.cfg = { ...DEFAULT };
        this.calculate();
    }

    calculate() {
        this.saveConfig();
        this.loading      = true;
        this.errorMessage = null;

        const apiCfg: SolarConfig = { ...this.cfg, efficiency: this.efficiency, maxAcW: this.cfg.maxAcW };

        this.svc.getTomorrow(apiCfg).subscribe({
            next:  (data) => { this.loading = false; this.build(data); },
            error: (err)  => { this.loading = false; this.errorMessage = err.message || 'Fout bij ophalen voorspelling'; }
        });
    }

    private build(data: SolarTomorrow) {
        this.result = data;

        const d = new Date(data.date + 'T12:00:00');
        this.dateLabel = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

        const activeHours = data.hourly.filter(h => h.energy_wh > 0);
        const maxWh = activeHours.length ? Math.max(...activeHours.map(h => h.energy_wh)) : 1;

        this.chartData = {
            labels: data.hourly.map(h => `${String(h.hour).padStart(2, '0')}:00`),
            datasets: [{
                data:            data.hourly.map(h => h.energy_wh),
                backgroundColor: data.hourly.map(h => this.barColor(h.energy_wh, maxWh)),
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
                            const h = data.hourly[ctx.dataIndex];
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

    get peakW(): number {
        if (!this.result) return 0;
        return Math.max(...this.result.hourly.map(h => h.power_w));
    }

    get sunHours(): number {
        if (!this.result) return 0;
        return this.result.hourly.filter(h => h.energy_wh > 0).length;
    }

    formatWh(wh: number): string {
        return wh >= 1000 ? `${(wh / 1000).toFixed(2)} kWh` : `${wh} Wh`;
    }
}
