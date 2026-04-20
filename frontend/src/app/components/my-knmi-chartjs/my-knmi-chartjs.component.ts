import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

@Component({
    selector: 'app-my-knmi-chartjs',
    standalone: true,
    imports: [CommonModule, ChartModule],
    templateUrl: './my-knmi-chartjs.component.html',
    styleUrl: './my-knmi-chartjs.component.css',
})
export class MyKnmiChartjsComponent implements OnChanges {
    @Input() rows:          any[]        = [];
    @Input() configJson:    string | null = null;
    @Input() title         = '';
    @Input() selectedYear?:  string;
    @Input() selectedMonth?: string;
    @Input() timebase?:      string | null;

    chartType: 'bar' | 'line' | 'scatter' | 'bubble' | 'pie' | 'doughnut' | 'polarArea' | 'radar' = 'line';
    chartData:    any = null;
    chartOptions: any = null;
    noDataMessage: string | null = null;

    private lastConfigJson: string | null = null;
    private lastTimebase: string | null | undefined = undefined;

    ngOnChanges(changes: SimpleChanges) {
        if (changes['rows'] || changes['configJson']) {
            this.buildChart();
        }
    }

    private toDateStr(d: any): string {
        if (!d) return '';
        const dt = d instanceof Date ? d : new Date(d);
        return isNaN(dt.getTime()) ? String(d).slice(0, 10) : dt.toISOString().slice(0, 10);
    }

    private buildDailyData(): { rows: any[]; labels: string[] } {
        const year    = +this.selectedYear!;
        const month   = +this.selectedMonth!;
        const endDate = new Date(Date.UTC(year, month, 0));
        const mergedData: any[] = [];
        const labels:    string[] = [];
        let current = new Date(Date.UTC(year, month - 1, 1));
        while (current <= endDate) {
            const dateStr = current.toISOString().slice(0, 10);
            const day     = current.getUTCDate();
            const dataEntry = this.rows.find((r: any) => this.toDateStr(r.datum) === dateStr)
                           || this.rows.find((r: any) => +r.dag === day)
                           || {};
            mergedData.push({ dagLabel: day, ...dataEntry });
            labels.push(String(day));
            current.setUTCDate(day + 1);
        }
        return { rows: mergedData, labels };
    }

    private buildMonthlyByMonth(cfg: any): { rows: any[]; labels: string[] } {
        const xField    = cfg.xAxisFieldMonth ?? 'maand';
        const monthNames = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
        const mergedData: any[] = [];
        const labels:    string[] = [];
        for (let m = 1; m <= 12; m++) {
            const dataEntry = this.rows.find((r: any) => +r[xField] === m) || {};
            mergedData.push({ maandLabel: monthNames[m - 1], ...dataEntry });
            labels.push(monthNames[m - 1]);
        }
        return { rows: mergedData, labels };
    }

    private buildDecadeData(cfg: any): { rows: any[]; labels: string[] } {
        const monthNames  = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
        const maandField  = cfg.xAxisFieldMonth ?? 'maand';
        const mergedData: any[] = [];
        const labels: string[]  = [];
        for (let m = 1; m <= 12; m++) {
            for (let d = 1; d <= 3; d++) {
                const label     = `${monthNames[m - 1]}-${d}`;
                const dataEntry = this.rows.find((r: any) => +r[maandField] === m && +r['decade'] === d) || {};
                mergedData.push({ decadeLabel: label, ...dataEntry });
                labels.push(label);
            }
        }
        return { rows: mergedData, labels };
    }

    private buildMonthlyByYear(cfg: any): { rows: any[]; labels: string[] } {
        const xField = cfg.xAxisFieldYear ?? 'jaar';
        const sorted = [...this.rows].sort((a, b) => +a[xField] - +b[xField]);
        return { rows: sorted, labels: sorted.map(r => String(r[xField])) };
    }

    private buildChart() {
        let cfg: any = {};
        if (this.configJson) {
            try { cfg = JSON.parse(this.configJson); } catch { cfg = {}; }
        }

        const isMonthly = this.timebase === 'maand';
        const hasYear   = !!this.selectedYear;
        const hasMonth  = !!this.selectedMonth;

        if (isMonthly) {
            if (!hasYear && !hasMonth) {
                this.chartData     = null;
                this.noDataMessage = 'Selecteer een jaar of een maand om de grafiek te tonen.';
                return;
            }
            if (hasYear && hasMonth) {
                this.chartData     = null;
                this.noDataMessage = 'Selecteer óf een jaar óf een maand, niet beide.';
                return;
            }
        }

        this.noDataMessage = null;

        if (!this.rows?.length) {
            if (this.timebase === 'jaar' || this.timebase === 'decade' || this.timebase === 'seizoen') {
                this.noDataMessage = 'Selecteer een station om de grafiek te tonen.';
            } else if (this.timebase === 'uur') {
                this.noDataMessage = 'Selecteer een station, jaar en maand om de grafiek te tonen.';
            }
            this.chartData = null;
            return;
        }

        const { rows: chartRows, labels } =
            this.timebase === 'dag' && hasMonth       ? this.buildDailyData()          :
            isMonthly && hasYear && !hasMonth          ? this.buildMonthlyByMonth(cfg)  :
            isMonthly && hasMonth && !hasYear          ? this.buildMonthlyByYear(cfg)   :
            this.timebase === 'jaar'
                ? { rows: this.rows, labels: this.rows.map((r: any) => String(r[cfg.xField ?? 'jaar'])) }
            : this.timebase === 'decade'
                ? this.buildDecadeData(cfg)
            : this.timebase === 'seizoen'
                ? { rows: this.rows, labels: this.rows.map((r: any) => String(r[cfg.xField ?? 'seizoen'])) }
            : this.timebase === 'uur'
                ? { rows: this.rows, labels: this.rows.map((r: any) => `${r['dag']}-${+r['uur'] - 1}`) }
                : { rows: this.rows, labels: this.rows.map((_: any, i: number) => String(i + 1)) };

        this.chartType = (cfg.type || 'line') as any;

        const datasets = (cfg.data?.datasets || []).map((ds: any) => ({
            ...ds,
            data:        chartRows.map((r: any) => r[ds.dataField] ?? null),
            tension:     ds.tension     ?? 0,
            pointRadius: ds.pointRadius ?? 3,
            borderWidth: ds.borderWidth ?? 2,
            fill:        ds.fill        ?? false,
        }));

        this.chartData = { labels, datasets };

        const configChanged = this.configJson !== this.lastConfigJson || this.timebase !== this.lastTimebase;
        this.lastConfigJson = this.configJson;
        this.lastTimebase   = this.timebase;

        if (configChanged || !this.chartOptions) {
            const scale    = cfg.yAxis?.scale;
            const isYearly = this.timebase === 'jaar';
            const monthly  = isMonthly && scale && (scale.monthlyChartMin != null || scale.monthlyChartMax != null);
            const yearly   = isYearly  && scale && (scale.yearlyChartMin  != null || scale.yearlyChartMax  != null);
            const yMin = yearly ? (scale.yearlyChartMin ?? scale.chartMin) : monthly ? (scale.monthlyChartMin ?? scale.chartMin) : (cfg.chartMin ?? cfg.options?.scales?.y?.min ?? scale?.chartMin ?? undefined);
            const yMax = yearly ? (scale.yearlyChartMax ?? scale.chartMax) : monthly ? (scale.monthlyChartMax ?? scale.chartMax) : (cfg.chartMax ?? cfg.options?.scales?.y?.max ?? scale?.chartMax ?? undefined);

            this.chartOptions = {
                responsive:          true,
                maintainAspectRatio: false,
                animation:           false,
                plugins: {
                    legend:  { labels: { color: '#495057' } },
                    tooltip: { mode: 'index', intersect: false },
                    ...(this.title ? { title: { display: true, text: this.title, color: '#495057' } } : {}),
                },
                scales: {
                    x: {
                        ticks: { color: '#6c757d', maxRotation: 0 },
                        grid:  { color: 'rgba(0,0,0,0.05)' },
                    },
                    y: {
                        ticks: { color: '#6c757d' },
                        grid:  { color: 'rgba(0,0,0,0.05)' },
                        ...(yMin != null ? { min: yMin } : {}),
                        ...(yMax != null ? { max: yMax } : {}),
                    }
                }
            };
        }
    }
}
