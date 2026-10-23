import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import { localDateTime } from 'src/app/utils/local-time.util';

export interface WeatherChartSeries {
    label:   string;
    data:    (number | null)[];          // same length and order as `times`
    color:   string;
    type?:   'line' | 'bar';
    dashed?: boolean;
}

// A parameter over the whole forecast period: one point per hour, one or more series (lines or bars).
// The x axis is a category axis with one label per hour (hourly buckets, see dev-standards/frontend/chart-js.md); only the
// first hour of a local day is labelled, with a gridline. Used by the forecast page and the weather models page.
@Component({
    selector: 'app-my-weather-chart',
    standalone: true,
    imports: [CommonModule, ChartModule],
    template: `
        @if (chartData) {
          <div class="weather-chart-wrapper">
            <p-chart [type]="chartType" [data]="chartData" [options]="chartOptions" [plugins]="plugins" width="100%" height="100%"></p-chart>
          </div>
        }`,
    styles: [`.weather-chart-wrapper { position: relative; height: 420px; width: 100%; }`]
})
export class MyWeatherChartComponent implements OnChanges {
    @Input() times:  string[] = [];                         // UTC 'YYYY-MM-DDTHH:mm', one per point
    @Input() series: WeatherChartSeries[] = [];
    @Input() unit = '';
    @Input() refLine: { value: number; label: string } | null = null;
    @Input() highlightDate: string | null = null;           // local date 'YYYY-MM-DD' to shade (the day chosen in the table)

    chartType: 'bar' | 'line' = 'line';
    chartData:    any = null;
    chartOptions: any = null;
    plugins:      any[] = [];

    private localDates: string[] = [];
    private localTimes: string[] = [];

    ngOnChanges(): void {
        this.build();
    }

    private dayLabel(date: string): string {
        return new Date(date + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    private build(): void {
        if (!this.times.length || !this.series.length) { this.chartData = null; return; }

        const lt = this.times.map(t => localDateTime(t));
        this.localDates = lt.map(x => x.date);
        this.localTimes = lt.map(x => x.time);
        const labels = this.times.map((_, i) => `${this.dayLabel(this.localDates[i])} ${this.localTimes[i]}`);

        const hasBar = this.series.some(s => s.type === 'bar');
        this.chartType = hasBar ? 'bar' : 'line';

        const datasets: any[] = this.series.map(s => s.type === 'bar'
            ? { type: 'bar', label: s.label, data: s.data, backgroundColor: s.color, borderColor: s.color, barPercentage: 1, categoryPercentage: 0.9 }
            : { type: 'line', label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.25, spanGaps: false, borderDash: s.dashed ? [6, 4] : [] });
        if (this.refLine) {
            datasets.push({ type: 'line', label: this.refLine.label, data: this.times.map(() => this.refLine!.value), borderColor: '#ef4444', borderWidth: 1, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0, fill: false });
        }
        this.chartData = { labels, datasets };

        const localTimes = this.localTimes;
        const localDates = this.localDates;
        this.chartOptions = {
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: datasets.length > 1 },
                tooltip: { callbacks: { label: (c: any) => c.parsed.y == null ? '' : `${c.dataset.label}: ${c.parsed.y}${this.unit ? ' ' + this.unit : ''}` } }
            },
            scales: {
                x: {
                    type: 'category',
                    grid: { tickLength: 4, lineWidth: (ctx: any) => (localTimes[ctx.index] === '00:00' ? 1 : 0) },
                    ticks: {
                        autoSkip: false, maxRotation: 0, padding: 6,
                        callback: (_v: any, i: number) => (localTimes[i] === '00:00' ? this.dayLabel(localDates[i]) : '')
                    }
                },
                y: { title: { display: !!this.unit, text: this.unit }, beginAtZero: hasBar }
            },
            layout: { padding: { right: 4 } }
        };

        // shade the day that is selected in the table
        const highlight = this.highlightDate;
        this.plugins = [{
            id: 'dayHighlight',
            beforeDatasetsDraw: (chart: any) => {
                if (!highlight) return;
                const first = localDates.indexOf(highlight);
                const last  = localDates.lastIndexOf(highlight);
                if (first < 0) return;
                const x = chart.scales.x, area = chart.chartArea;
                const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
                const ctx = chart.ctx;
                ctx.save();
                ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
                ctx.fillRect(x.getPixelForValue(first) - half, area.top, x.getPixelForValue(last) - x.getPixelForValue(first) + 2 * half, area.bottom - area.top);
                ctx.restore();
            }
        }];
    }
}
