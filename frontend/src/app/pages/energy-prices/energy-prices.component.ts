import { Component, OnInit } from '@angular/core';
import { EnergyPricesService, PriceRow } from 'src/app/services/energy-prices.service';

@Component({
    selector: 'app-energy-prices',
    templateUrl: './energy-prices.component.html',
    styleUrls: ['./energy-prices.component.scss'],
    standalone: false
})
export class EnergyPricesComponent implements OnInit {

    loading       = false;
    errorMessage: string | null = null;

    selectedDate  = new Date();
    isToday       = true;

    dayLabel      = '';
    nextDayLabel  = '';

    dayData:         any = null;
    nextDayData:     any = null;
    chartOptions:    any = null;

    nextDayAvailable = false;

    currentPrice:  number | null = null;
    avgDay:        number | null = null;
    minDay:        number | null = null;
    maxDay:        number | null = null;
    updatedAt:     string = '';

    constructor(private svc: EnergyPricesService) {}

    ngOnInit() {
        this.load();
    }

    load() {
        this.loading      = true;
        this.errorMessage = null;
        this.isToday      = this.localDateStr(this.selectedDate) === this.localDateStr(new Date());
        const date        = this.isToday ? undefined : this.localDateStr(this.selectedDate);
        this.svc.getPrices(date).subscribe({
            next:  (rows) => { this.loading = false; this.build(rows); },
            error: (err)  => { this.loading = false; this.errorMessage = err.message || 'Fout bij ophalen prijzen'; }
        });
    }

    goToday() {
        this.selectedDate = new Date();
        this.load();
    }

    prevDay() {
        this.selectedDate = new Date(this.selectedDate.getTime() - 86400000);
        this.load();
    }

    nextDay() {
        this.selectedDate = new Date(this.selectedDate.getTime() + 86400000);
        this.load();
    }

    onDateSelect() {
        this.load();
    }

    private build(rows: PriceRow[]) {
        const now        = new Date();
        const selStr     = this.localDateStr(this.selectedDate);
        const nextDate   = new Date(this.selectedDate.getTime() + 86400000);
        const nextStr    = this.localDateStr(nextDate);

        this.dayLabel     = this.selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
        this.nextDayLabel = nextDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

        const byLocal: Record<string, { label: string; price: number; isNow: boolean }[]> = {};

        for (const row of rows) {
            const dateStr   = (row.priceDate as string).slice(0, 10);
            const dt        = new Date(`${dateStr}T${String(row.priceHour).padStart(2, '0')}:00:00Z`);
            const localDate = this.localDateStr(dt);
            const localHour = dt.getHours();
            const isNow     = this.isToday && localDate === selStr && localHour === now.getHours();

            if (!byLocal[localDate]) byLocal[localDate] = [];
            byLocal[localDate].push({ label: `${String(localHour).padStart(2, '0')}:00`, price: row.priceKwh, isNow });
        }

        const dayRows     = (byLocal[selStr]  || []).sort((a, b) => a.label.localeCompare(b.label));
        const nextDayRows = (byLocal[nextStr] || []).sort((a, b) => a.label.localeCompare(b.label));

        this.nextDayAvailable = nextDayRows.length > 0;
        this.dayData          = this.buildDataset(dayRows);
        this.nextDayData      = this.nextDayAvailable ? this.buildDataset(nextDayRows) : null;

        this.currentPrice = null;
        this.avgDay = this.minDay = this.maxDay = null;
        if (dayRows.length) {
            const prices  = dayRows.map(r => r.price);
            this.minDay   = Math.min(...prices);
            this.maxDay   = Math.max(...prices);
            this.avgDay   = prices.reduce((s, v) => s + v, 0) / prices.length;
            this.currentPrice = this.isToday ? (dayRows.find(r => r.isNow)?.price ?? null) : null;
        }

        this.updatedAt = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

        this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx: any) => `€ ${Number(ctx.raw).toFixed(4)} /kWh` } }
            },
            scales: { y: { ticks: { callback: (v: number) => `€ ${v.toFixed(3)}` } } }
        };
    }

    private buildDataset(rows: { label: string; price: number; isNow: boolean }[]): any {
        if (!rows.length) return null;
        const prices = rows.map(r => r.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const colors = rows.map(r => r.isNow ? 'rgba(99, 102, 241, 0.9)' : this.priceColor(r.price, min, max));
        return {
            labels: rows.map(r => r.label),
            datasets: [{ data: prices, backgroundColor: colors, borderColor: colors, borderWidth: 1 }]
        };
    }

    private priceColor(price: number, min: number, max: number): string {
        const ratio = max === min ? 0.5 : (price - min) / (max - min);
        let r: number, g: number, b: number;
        if (ratio < 0.5) {
            const t = ratio * 2;
            r = Math.round(34  + t * (234 - 34));
            g = Math.round(197 + t * (179 - 197));
            b = Math.round(94  + t * (8   - 94));
        } else {
            const t = (ratio - 0.5) * 2;
            r = Math.round(234 + t * (239 - 234));
            g = Math.round(179 + t * (68  - 179));
            b = Math.round(8   + t * (68  - 8));
        }
        return `rgba(${r}, ${g}, ${b}, 0.85)`;
    }

    private localDateStr(d: Date): string {
        return d.toLocaleDateString('en-CA');
    }

    formatEur(val: number | null): string {
        if (val === null) return '—';
        return `€ ${val.toFixed(4)}`;
    }
}
