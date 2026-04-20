import { Component, Input, ElementRef, ViewChild, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { AnyChartService } from 'src/app/services/anychart.service';

@Component({
    selector: 'app-my-knmi-anychart',
    standalone: true,
    templateUrl: './my-knmi-anychart.component.html',
    styleUrls: ['./my-knmi-anychart.component.css']
})
export class MyKnmiAnychartComponent implements OnChanges, OnDestroy {
    @Input() rows: any[] = [];
    @Input() configJson: string | null = null;
    @Input() title = '';
    @Input() selectedYear?: string;
    @Input() selectedMonth?: string;
    @Input() timebase?: string | null;

    @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;

    noDataMessage: string | null = null;

    private chart: any = null;
    private seriesInstances: any[] = [];
    private lastConfigJson: string | null = null;
    private lastTimebase: string | null | undefined = undefined;

    constructor(private anyChartService: AnyChartService) {}

    ngOnChanges(changes: SimpleChanges) {
        if ((changes['rows'] || changes['configJson']) && this.rows?.length) {
            this.renderChart();
        } else if ((changes['rows'] || changes['configJson']) && !this.rows?.length) {
            this.clearChart();
            this.noDataMessage = null;
        }
    }

    ngOnDestroy() {
        if (this.chart) {
            try { this.chart.dispose(); } catch { /* ignore */ }
            this.chart = null;
        }
    }

    private normalizeChartConfig(cfg: any): any {
        if (!cfg.commonSeriesSettings) return cfg;
        const xField    = cfg.commonSeriesSettings.argumentField || 'x';
        const chartType = cfg.commonSeriesSettings.type || 'line';
        return {
            chartType,
            xField,
            chartTitle: cfg.title || null,
            xAxis:  { title: cfg.argumentAxis?.title || null },
            yAxis:  {
                title: cfg.valueAxis?.title || null,
                scale: {
                    chartMin:  cfg.valueAxis?.min  ?? null,
                    chartMax:  cfg.valueAxis?.max  ?? null,
                    majorTick: null,
                    minorTick: null,
                }
            },
            series: (cfg.series || []).map((s: any) => ({
                dataField: s.valueField,
                label:     s.name,
                type:      s.type || chartType,
                color:     s.color || null,
            }))
        };
    }

    private toDateStr(d: any): string {
        if (!d) return '';
        const dt = d instanceof Date ? d : new Date(d);
        return isNaN(dt.getTime()) ? String(d).slice(0, 10) : dt.toISOString().slice(0, 10);
    }

    private buildDailyData(): { rows: any[]; xField: string } {
        const year  = +this.selectedYear!;
        const month = +this.selectedMonth!;
        const endDate = new Date(Date.UTC(year, month, 0));
        const mergedData: any[] = [];
        let current = new Date(Date.UTC(year, month - 1, 1));
        while (current <= endDate) {
            const dateStr = current.toISOString().slice(0, 10);
            const day = current.getUTCDate();
            const dataEntry = this.rows.find((r: any) => this.toDateStr(r.datum) === dateStr)
                           || this.rows.find((r: any) => +r.dag === day)
                           || {};
            mergedData.push({ dagLabel: day, ...dataEntry });
            current.setUTCDate(day + 1);
        }
        return { rows: mergedData, xField: 'dagLabel' };
    }

    private buildMonthlyByMonth(cfg: any): { rows: any[]; xField: string } {
        const monthField = cfg.xAxisFieldMonth ?? 'maand';
        const months = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
        const mergedData = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
            const dataEntry = this.rows.find((r: any) => +r[monthField] === m) || {};
            return { maandLabel: months[m - 1], [monthField]: m, ...dataEntry };
        });
        return { rows: mergedData, xField: 'maandLabel' };
    }

    private buildHourlyData(): { rows: any[]; xField: string } {
        const rows = this.rows.map((r: any) => ({
            ...r,
            uurLabel: `${r['dag']}-${+r['uur'] - 1}`
        }));
        return { rows, xField: 'uurLabel' };
    }

    private buildDecadeData(cfg: any): { rows: any[]; xField: string } {
        const monthNames = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
        const maandField = cfg.xAxisFieldMonth ?? 'maand';
        const mergedData: any[] = [];
        for (let m = 1; m <= 12; m++) {
            for (let d = 1; d <= 3; d++) {
                const label     = `${monthNames[m - 1]}-${d}`;
                const dataEntry = this.rows.find((r: any) => +r[maandField] === m && +r['decade'] === d) || {};
                mergedData.push({ decadeLabel: label, ...dataEntry });
            }
        }
        return { rows: mergedData, xField: 'decadeLabel' };
    }

    private buildMonthlyByYear(cfg: any): { rows: any[]; xField: string } {
        const xField = cfg.xAxisFieldYear ?? 'jaar';
        const sorted = [...this.rows].sort((a, b) => +a[xField] - +b[xField]);
        return { rows: sorted, xField };
    }

    private clearChart() {
        if (this.chart) {
            try { this.chart.dispose(); } catch { /* ignore */ }
            this.chart = null;
        }
        this.chartContainer.nativeElement.innerHTML = '';
        this.seriesInstances = [];
    }

    private renderChart() {
        let cfg: any = {};
        if (this.configJson) {
            try { cfg = this.normalizeChartConfig(JSON.parse(this.configJson)); } catch { cfg = {}; }
        }

        const isMonthly = this.timebase === 'maand';
        const hasYear   = !!this.selectedYear;
        const hasMonth  = !!this.selectedMonth;

        if (isMonthly) {
            if (!hasYear && !hasMonth) {
                this.noDataMessage = 'Selecteer een jaar of een maand om de grafiek te tonen.';
                this.clearChart();
                return;
            }
            if (hasYear && hasMonth) {
                this.noDataMessage = 'Selecteer óf een jaar óf een maand, niet beide.';
                this.clearChart();
                return;
            }
        }

        this.noDataMessage = null;
        if (!this.rows?.length) {
            if (this.timebase === 'jaar' || this.timebase === 'decade' || this.timebase === 'seizoen') {
                this.noDataMessage = 'Selecteer een station om de grafiek te tonen.';
                this.clearChart();
            } else if (this.timebase === 'uur') {
                this.noDataMessage = 'Selecteer een station, jaar en maand om de grafiek te tonen.';
                this.clearChart();
            }
            return;
        }

        const cols        = Object.keys(this.rows[0]);
        const defaultType = cfg.chartType || 'line';
        const seriesList: any[] = cfg.series?.length
            ? cfg.series
            : cols.filter(c => c !== 'datum' && c !== 'dagLabel').map((c: string) => ({ dataField: c, label: c, type: defaultType }));

        const { rows: chartRows, xField } =
            this.timebase === 'uur'               ? this.buildHourlyData()        :
            this.timebase === 'dag'               ? this.buildDailyData()        :
            isMonthly && hasYear && !hasMonth      ? this.buildMonthlyByMonth(cfg) :
            isMonthly && hasMonth && !hasYear      ? this.buildMonthlyByYear(cfg)  :
            this.timebase === 'decade'             ? this.buildDecadeData(cfg)     :
            { rows: this.rows, xField: cfg.xField || (
                this.timebase === 'jaar'    ? 'jaar'    :
                this.timebase === 'seizoen' ? 'seizoen' : cols[0]) };

        const configChanged = this.configJson !== this.lastConfigJson;

        if (this.chart && !configChanged && this.seriesInstances.length === seriesList.length) {
            this.chart.suspendSignalsDispatching();
            this.seriesInstances.forEach((series, i) => {
                const s    = seriesList[i];
                const data = chartRows.map((r: any) => { const v = r[s.dataField]; return [String(r[xField]), (s.skipZero && +v === 0) ? null : (v ?? null)]; });
                series.data(data);
            });
            this.chart.resumeSignalsDispatching(true);
            return;
        }

        this.lastConfigJson  = this.configJson;
        this.lastTimebase    = this.timebase;
        this.seriesInstances = [];

        const container = this.chartContainer.nativeElement;
        const defaultMarkers = ['square', 'triangle-up', 'circle', 'diamond', 'star5'];

        this.anyChartService.initializeAnyChart('cartesian').then((chart: any) => {
            container.innerHTML = '';
            if (this.chart) {
                try { this.chart.dispose(); } catch { /* ignore */ }
            }
            this.chart = chart;

            chart.title(cfg.chartTitle || this.title);
            chart.xGrid().enabled(true);
            chart.yGrid().enabled(true);
            chart.yGrid().palette(['#F0F0F0 0.25', '#FFFFFF 0.25']);
            chart.yMinorGrid().enabled(true);
            chart.yMinorGrid().stroke('#EBEBEB');
            chart.xAxis().overlapMode('allow-overlap');

            if (cfg.xAxis?.title)        chart.xAxis().title(cfg.xAxis.title);
            if (cfg.yAxis?.title)        chart.yAxis().title(cfg.yAxis.title);
            if (cfg.yAxis?.labelsFormat) chart.yAxis().labels().format(cfg.yAxis.labelsFormat);

            seriesList.forEach((s: any, i: number) => {
                const type = s.type || defaultType;
                const data = chartRows.map((r: any) => { const v = r[s.dataField]; return [String(r[xField]), (s.skipZero && +v === 0) ? null : (v ?? null)]; });
                const series = chart[type]?.(data);
                if (!series) return;
                series.name(s.label || s.dataField);
                if (type === 'line') {
                    series.stroke(s.color || '#0088cc', s.thickness || 2);
                    series.markers().enabled(true);
                    series.markers().type(s.markerType || defaultMarkers[i % defaultMarkers.length]);
                    series.markers().size(s.markerSize || 2);
                    series.markers().fill(s.color || '#0088cc');
                    series.markers().stroke(s.color || '#0088cc');
                } else if (type === 'column' || type === 'bar') {
                    series.stroke(s.color || '#0088cc', s.thickness || 1);
                    series.fill(s.fillColor || s.color || '#0088cc');
                }
                if (s.tooltip) series.tooltip().format(s.tooltip);
                this.seriesInstances.push(series);
            });

            const scale = cfg.yAxis?.scale;
            if (scale) {
                const isYearly = this.timebase === 'jaar';
                const monthly  = isMonthly && (scale.monthlyChartMin != null || scale.monthlyChartMax != null);
                const yearly   = isYearly  && (scale.yearlyChartMin  != null || scale.yearlyChartMax  != null);
                const scMin  = yearly ? (scale.yearlyChartMin  ?? scale.chartMin)  : monthly ? (scale.monthlyChartMin  ?? scale.chartMin)  : scale.chartMin;
                const scMax  = yearly ? (scale.yearlyChartMax  ?? scale.chartMax)  : monthly ? (scale.monthlyChartMax  ?? scale.chartMax)  : scale.chartMax;
                const scMaj  = yearly ? (scale.yearlyMajorTick ?? scale.majorTick) : monthly ? (scale.monthlyMajorTick ?? scale.majorTick) : scale.majorTick;
                const scMin2 = yearly ? (scale.yearlyMinorTick ?? scale.minorTick) : monthly ? (scale.monthlyMinorTick ?? scale.minorTick) : scale.minorTick;
                if (scMin  != null) chart.yScale().minimum(scMin);
                if (scMax  != null) chart.yScale().maximum(scMax);
                if (scMaj  != null) chart.yScale().ticks().interval(scMaj);
                if (scMin2 != null) chart.yScale().minorTicks().interval(scMin2);
            }

            chart.legend(seriesList.length > 1);
            chart.container(container);
            chart.draw();
        });
    }
}
