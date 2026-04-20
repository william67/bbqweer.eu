import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { forkJoin, Observable } from 'rxjs';
import { ExcelExportService } from 'src/app/services/excel-export.service';
import { KnmiReportsService } from 'src/app/services/knmi-reports.service';
import { LocalStorageService } from 'src/app/services/local-storage.service';

const SETTINGS_KEY = 'knmidata-settings';

// All 8 filter types — fieldKey / inputKey map to columns on reports
const FILTER_TYPES = [
    { type: 'station',         fieldKey: 'fieldName_station',         inputKey: 'input_station',         label: 'Station',         plural: 'stations',          hasSearch: true,  width: '200px' },
    { type: 'neerslagstation', fieldKey: 'fieldName_neerslagstation',  inputKey: 'input_neerslagstation',  label: 'Neerslagstation', plural: 'neerslagstations',  hasSearch: true,  width: '200px' },
    { type: 'jaar',            fieldKey: 'fieldName_jaar',            inputKey: 'input_jaar',            label: 'Jaar',            plural: 'jaren',             hasSearch: false, width: '110px' },
    { type: 'maand',           fieldKey: 'fieldName_maand',           inputKey: 'input_maand',           label: 'Maand',           plural: 'maanden',           hasSearch: false, width: '160px' },
    { type: 'week',            fieldKey: 'fieldName_week',            inputKey: 'input_week',            label: 'Week',            plural: 'weken',             hasSearch: false, width: '110px' },
    { type: 'dag',             fieldKey: 'fieldName_dag',             inputKey: 'input_dag',             label: 'Dag',             plural: 'dagen',             hasSearch: false, width: '110px' },
    { type: 'seizoen',         fieldKey: 'fieldName_seizoen',         inputKey: 'input_seizoen',         label: 'Seizoen',         plural: 'seizoenen',         hasSearch: false, width: '130px' },
    { type: 'decade',          fieldKey: 'fieldName_decade',          inputKey: 'input_decade',          label: 'Decade',          plural: 'decaden',           hasSearch: false, width: '110px' },
];

@Component({
    selector: 'app-knmidata',
    templateUrl: './knmidata.component.html',
    standalone: false
})
export class KnmiDataComponent implements OnInit, OnDestroy {

    @ViewChild('configFileInput') configFileInput!: ElementRef<HTMLInputElement>;

    private style!: HTMLStyleElement;

    // data from API
    datasets:          any[] = [];
    stations:          any[] = [];
    neerslagstations:  any[] = [];
    categories:        any[] = [];

    // selections
    selectedCategoryId: number | null = null;
    selectedDatasetId:  number | null = null;
    selectedTimebase:   string | null = null;

    // raw result + fieldName_*-driven filters
    rawRows:       any[] = [];
    filterValues:  Record<string, any> = {};
    filterOptions: Record<string, { value: any; label: string }[]> = {};

    // output
    outputMode: 'table' | 'anychart' | 'chartjs' = 'table';
    loading        = false;
    errorMessage:  string | null = null;
    importStatus:  string | null = null;
    timebase:      string | null = null;
    anychartConfig: string | null = null;
    chartjsConfig:  string | null = null;

    // static options for mandatory filter dropdowns (shown before data loads)
    readonly maanden = [
        { value: 1,  label: 'Januari' },  { value: 2,  label: 'Februari' },
        { value: 3,  label: 'Maart' },    { value: 4,  label: 'April' },
        { value: 5,  label: 'Mei' },      { value: 6,  label: 'Juni' },
        { value: 7,  label: 'Juli' },     { value: 8,  label: 'Augustus' },
        { value: 9,  label: 'September' },{ value: 10, label: 'Oktober' },
        { value: 11, label: 'November' }, { value: 12, label: 'December' },
    ];
    readonly seizoenen = [
        { value: 'W', label: 'Winter' }, { value: 'L', label: 'Lente' },
        { value: 'Z', label: 'Zomer' },  { value: 'H', label: 'Herfst' },
    ];
    private readonly staticYears   = Array.from({ length: new Date().getFullYear() - 1900 }, (_, i) => ({ value: new Date().getFullYear() - i, label: String(new Date().getFullYear() - i) }));
    private readonly staticWeken   = Array.from({ length: 53 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
    private readonly staticDagen   = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
    private readonly staticDecades = [1, 2, 3].map(v => ({ value: v, label: String(v) }));

    // exposed to template for Edit Report dialog
    readonly filterTypes = FILTER_TYPES;
    reportColumnOptions: { value: string; label: string }[] = [];
    private _reportColumns: string[] = [];
    get reportColumns(): string[] { return this._reportColumns; }
    set reportColumns(cols: string[]) {
        this._reportColumns = cols;
        this.reportColumnOptions = cols.map(c => ({ value: c, label: c }));
    }

    // timebase display labels
    readonly timebaseLabels: Record<string, string> = {
        uur: 'Uur', dag: 'Dag', week: 'Week',
        maand: 'Maand', seizoen: 'Seizoen', decade: 'Decade', jaar: 'Jaar', overzicht: 'Overzicht'
    };
    readonly timebaseOptions = Object.entries(this.timebaseLabels)
        .map(([value, label]) => ({ value, label }));

    adminMenuItems: MenuItem[] = [];

    private updateAdminMenu() {
        const hasCat = !!this.selectedCategoryId;
        const hasDs  = !!this.selectedDataset;
        const hasRp  = !!this.selectedReport;
        this.adminMenuItems = [
            { label: 'Nieuwe categorie',  icon: 'pi pi-plus',        command: () => this.openNewCategory() },
            { label: 'Bewerk categorie',  icon: 'pi pi-pencil',      command: () => this.openEditCategory(),        disabled: !hasCat },
            { separator: true },
            { label: 'Nieuw dataset',     icon: 'pi pi-plus',        command: () => this.openNewDataset() },
            { label: 'Edit Dataset',      icon: 'pi pi-pencil',      command: () => this.openEditDataset(),         disabled: !hasDs },
            { label: 'Edit AnyChart',     icon: 'pi pi-chart-bar',   command: () => this.openEditDatasetAnychart(), disabled: !hasDs },
            { label: 'Edit Chart.js',     icon: 'pi pi-chart-line',  command: () => this.openEditDatasetChartjs(),  disabled: !hasDs },
            { separator: true },
            { label: 'Nieuw rapport',     icon: 'pi pi-plus',        command: () => this.openNewReport(),           disabled: !hasDs },
            { label: 'Edit Report',       icon: 'pi pi-pencil',      command: () => this.openEditReport(),          disabled: !hasRp },
            { label: 'Edit Query',        icon: 'pi pi-database',    command: () => this.openEditQuery(),           disabled: !hasRp },
            { label: 'Edit AnyChart',     icon: 'pi pi-chart-bar',   command: () => this.openEditAnychart(),        disabled: !hasRp },
            { label: 'Edit Chart.js',     icon: 'pi pi-chart-line',  command: () => this.openEditChartjs(),         disabled: !hasRp },
            { separator: true },
            { label: 'Save Config',       icon: 'pi pi-download',    command: () => this.saveConfig(),              disabled: !hasDs },
            { label: 'Load Config',       icon: 'pi pi-folder-open', command: () => this.configFileInput.nativeElement.click() },
        ];
    }

    // new/edit category dialogs
    newCategoryVisible  = false;
    newCategorySaving   = false;
    newCategory: any    = {};
    editCategoryVisible = false;
    editCategory: any   = {};

    // new/edit dataset dialogs
    newDatasetVisible = false;
    newDatasetSaving  = false;
    newDataset: any   = {};
    editDatasetVisible = false;
    editDataset: any   = {};

    // edit report/query/chart dialogs
    editReportIsNew     = false;
    editReportVisible   = false;
    editQueryVisible    = false;
    editAnychartVisible = false;
    editChartjsVisible  = false;
    editDatasetAnychartVisible = false;
    editDatasetChartjsVisible  = false;
    editSaving          = false;
    editReport: any     = {};
    editQueryText       = '';
    editAnychartText    = '';
    editChartjsText     = '';
    editDatasetAnychartText = '';
    editDatasetChartjsText  = '';

    constructor(
        private svc: KnmiReportsService,
        private excelExportService: ExcelExportService,
        private localStorage: LocalStorageService
    ) {}

    ngOnInit() {
        this.removeLayoutResponsive();
        this.updateAdminMenu();
        this.svc.getCategories().subscribe(data => { this.categories = data; });
        this.svc.getStations().subscribe(data => { this.stations = data; });
        this.svc.getNeerslagStations().subscribe(data => { this.neerslagstations = data; });
        this.svc.getDatasets().subscribe(data => {
            this.datasets = data;
            this.applyStoredDefaults();
        });
    }

    // ── Derived state ──────────────────────────────────────────────────────────

    get filteredDatasets(): any[] {
        return this.selectedCategoryId
            ? this.datasets.filter(d => d.category_id === this.selectedCategoryId)
            : this.datasets;
    }

    onCategoryChange() {
        if (this.selectedDatasetId && !this.filteredDatasets.find(d => d.id === this.selectedDatasetId)) {
            this.selectedDatasetId = null;
            this.selectedTimebase  = null;
            this.resetData();
        }
        this.updateAdminMenu();
    }

    get selectedDataset(): any {
        return this.datasets.find(d => d.id === this.selectedDatasetId) ?? null;
    }

    get availableTimebases(): any[] {
        return this.selectedDataset?.timebases ?? [];
    }

    get selectedReport(): any {
        return this.availableTimebases.find(r => r.timebase === this.selectedTimebase) ?? null;
    }

    // Active filters derived from fieldName_* columns on the report
    get activeFilters(): { type: string; fieldKey: string; inputKey: string; label: string; plural: string; hasSearch: boolean; width: string; fieldName: string; isMandatory: boolean }[] {
        const r = this.selectedReport;
        if (!r) return [];
        return FILTER_TYPES
            .filter(ft => !!r[ft.fieldKey])
            .map(ft => ({ ...ft, fieldName: r[ft.fieldKey] as string, isMandatory: !!r[ft.inputKey] }));
    }

    get canExecute(): boolean {
        if (!this.selectedReport) return false;
        return this.activeFilters
            .filter(f => f.isMandatory)
            .every(f => this.filterValues[f.type] != null);
    }

    // client-side filtered rows — mandatory filters already applied server-side
    filteredRows: any[] = [];

    private recomputeFilteredRows() {
        const optionals = this.activeFilters.filter(f => !f.isMandatory);
        if (!optionals.length) {
            this.filteredRows = this.rawRows;
            return;
        }
        this.filteredRows = this.rawRows.filter(row =>
            optionals.every(f => {
                const val = this.filterValues[f.type];
                if (val == null) return true;
                // if the value isn't in the available options, ignore the filter
                const opts = this.filterOptions[f.type] || [];
                if (opts.length && !opts.find((o: any) => String(o.value) === String(val))) return true;
                return String(row[f.fieldName]) === String(val);
            })
        );
    }

    private resetData() {
        this.rawRows       = [];
        this.filteredRows  = [];
        this.filterOptions = {};
        this.errorMessage  = null;
    }

    // Build options for mandatory filters from static lists (shown before data loads)
    private buildMandatoryFilterOptions() {
        for (const f of this.activeFilters.filter(af => af.isMandatory)) {
            this.filterOptions[f.type] = this.getStaticOptions(f.type);
        }
    }

    private getStaticOptions(type: string): { value: any; label: string }[] {
        switch (type) {
            case 'station':         return this.stations.map(s => ({ value: s.code, label: s.omschrijving }));
            case 'neerslagstation': return this.neerslagstations.map(s => ({ value: s.code, label: s.omschrijving }));
            case 'jaar':            return this.staticYears;
            case 'maand':           return this.maanden;
            case 'week':            return this.staticWeken;
            case 'dag':             return this.staticDagen;
            case 'seizoen':         return this.seizoenen;
            case 'decade':          return this.staticDecades;
            default:                return [];
        }
    }

    // Build options for optional filters from distinct values in rawRows
    private buildOptionalFilterOptions() {
        for (const f of this.activeFilters.filter(af => !af.isMandatory)) {
            const raw      = this.rawRows.map(r => r[f.fieldName]).filter(v => v != null);
            const distinct = [...new Set(raw)].sort((a: any, b: any) => (a > b ? 1 : -1));

            if (f.type === 'station') {
                const set = new Set(distinct.map(String));
                this.filterOptions[f.type] = this.stations
                    .filter(s => set.has(String(s.code)))
                    .map(s => ({ value: s.code, label: s.omschrijving }));
            } else if (f.type === 'neerslagstation') {
                const set = new Set(distinct.map(String));
                this.filterOptions[f.type] = this.neerslagstations
                    .filter(s => set.has(String(s.code)))
                    .map(s => ({ value: s.code, label: s.omschrijving }));
            } else if (f.type === 'maand') {
                const set = new Set(distinct.map(Number));
                this.filterOptions[f.type] = this.maanden.filter(m => set.has(m.value));
            } else if (f.type === 'seizoen') {
                const set = new Set(distinct.map(String));
                this.filterOptions[f.type] = this.seizoenen.filter(s => set.has(s.value));
            } else {
                this.filterOptions[f.type] = distinct.map((v: any) => ({ value: v, label: String(v) }));
            }
        }
    }

    // ── Selection handlers ─────────────────────────────────────────────────────

    onDatasetChange() {
        const prevTimebase = this.selectedTimebase;
        this.errorMessage  = null;
        if (this.availableTimebases.length > 0) {
            const keepTimebase    = prevTimebase && this.availableTimebases.find((t: any) => t.timebase === prevTimebase);
            this.selectedTimebase = keepTimebase ? prevTimebase : this.availableTimebases[0].timebase;
            this.buildMandatoryFilterOptions();
            this.refreshChartConfig();
            if (this.canExecute) this.execute();
        } else {
            this.selectedTimebase = null;
        }
        this.updateAdminMenu();
    }

    onTimebaseChange(timebase: string) {
        this.selectedTimebase = timebase;
        this.errorMessage     = null;
        this.resetFilterValues();
        this.buildMandatoryFilterOptions();
        this.refreshChartConfig();
        if (this.canExecute) this.execute();
        this.updateAdminMenu();
    }

    private resetFilterValues() {
        const now = new Date();
        this.filterValues = {
            jaar:  now.getFullYear(),
            maand: now.getMonth() + 1,
        };
        const stored = this.localStorage.getData(SETTINGS_KEY);
        if (stored) {
            try {
                const { station, neerslagstation } = JSON.parse(stored);
                if (station)         this.filterValues['station']         = station;
                if (neerslagstation) this.filterValues['neerslagstation'] = neerslagstation;
            } catch { /* ignore */ }
        }
    }

    private refreshChartConfig() {
        const ds = this.selectedDataset;
        const rp = this.selectedReport;
        this.anychartConfig = rp?.anychart_config || ds?.anychart_config || null;
        this.chartjsConfig  = rp?.chartjs_config  || ds?.chartjs_config  || null;
    }

    onFilterChange(type: string) {
        const f = this.activeFilters.find(af => af.type === type);
        if (f?.isMandatory) {
            // keep old rows visible during load — execute() replaces them atomically on response
            if (this.canExecute) this.execute();
        } else {
            this.recomputeFilteredRows();
        }
    }

    // ── Execute — one backend call per report, optional filters applied client-side

    execute() {
        if (!this.selectedReport) return;
        this.loading      = true;
        this.errorMessage = null;

        const body: any = { reportId: this.selectedReport.id };
        for (const f of this.activeFilters) {
            if (f.isMandatory && this.filterValues[f.type] != null) {
                body[f.type] = this.filterValues[f.type];
            }
        }

        this.svc.execute(body).subscribe({
            next: (result: any) => {
                this.loading  = false;
                this.rawRows  = result.rows || [];
                this.timebase = result.timebase || null;
                this.buildOptionalFilterOptions();
                this.recomputeFilteredRows();
            },
            error: (err: any) => {
                this.loading      = false;
                this.errorMessage = err.error?.error || err.message || 'Er is een fout opgetreden';
            }
        });
    }

    // ── New/edit categories ────────────────────────────────────────────────────

    openNewCategory() {
        this.newCategory = { name: '', sort_order: 0 };
        this.newCategoryVisible = true;
    }

    saveNewCategory() {
        if (!this.newCategory.name) return;
        this.newCategorySaving = true;
        this.svc.createCategory(this.newCategory).subscribe({
            next: (res: any) => {
                this.newCategorySaving  = false;
                this.newCategoryVisible = false;
                this.svc.getCategories().subscribe(data => {
                    this.categories         = data;
                    this.selectedCategoryId = res.id;
                    this.updateAdminMenu();
                });
            },
            error: (err: any) => { this.newCategorySaving = false; this.errorMessage = err.error?.error || err.message; }
        });
    }

    openEditCategory() {
        const cat = this.categories.find(c => c.id === this.selectedCategoryId);
        if (!cat) return;
        this.editCategory = { id: cat.id, code: cat.code || '', name: cat.name, sort_order: cat.sort_order ?? 0 };
        this.editCategoryVisible = true;
    }

    saveEditCategory() {
        const { id, ...body } = this.editCategory;
        this.editSaving = true;
        this.svc.updateCategory(id, body).subscribe({
            next: () => {
                this.editSaving = false;
                this.editCategoryVisible = false;
                const cat = this.categories.find(c => c.id === id);
                if (cat) Object.assign(cat, body);
            },
            error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message; }
        });
    }

    // ── New/edit datasets ──────────────────────────────────────────────────────

    openNewDataset() {
        this.newDataset = { code: '', name: '', category_id: this.selectedCategoryId ?? null, chartYn: false, sort_order: 0 };
        this.newDatasetVisible = true;
    }

    saveNewDataset() {
        if (!this.newDataset.name) return;
        this.newDatasetSaving = true;
        this.svc.createDataset(this.newDataset).subscribe({
            next: (res: any) => {
                this.newDatasetSaving  = false;
                this.newDatasetVisible = false;
                this.svc.getDatasets().subscribe(data => {
                    this.datasets          = data;
                    this.selectedDatasetId = res.id;
                    this.onDatasetChange();
                });
            },
            error: (err: any) => { this.newDatasetSaving = false; this.errorMessage = err.error?.error || err.message; }
        });
    }

    openEditDataset() {
        const ds = this.selectedDataset;
        if (!ds) return;
        this.editDataset = {
            id: ds.id, code: ds.code, name: ds.name,
            category_id: ds.category_id ?? null, chartYn: !!ds.chartYn, sort_order: ds.sort_order ?? 0,
        };
        this.editDatasetVisible = true;
    }

    saveEditDataset() {
        const { id, ...body } = this.editDataset;
        this.editSaving = true;
        this.svc.updateDataset(id, body).subscribe({
            next: () => {
                this.editSaving = false;
                this.editDatasetVisible = false;
                const ds = this.datasets.find(d => d.id === id);
                if (ds) Object.assign(ds, body);
                this.updateAdminMenu();
            },
            error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message; }
        });
    }

    // ── New/edit reports ───────────────────────────────────────────────────────

    openNewReport() {
        if (!this.selectedDataset) return;
        this.editReportIsNew = true;
        this.reportColumns   = [];
        this.editReport = {
            id: null, name: '', timebase: 'dag',
            input_station: false, input_neerslagstation: false,
            input_jaar: false, input_maand: false, input_week: false,
            input_dag: false, input_seizoen: false, input_decade: false,
            fieldName_station: null, fieldName_neerslagstation: null, fieldName_jaar: null,
            fieldName_maand: null, fieldName_week: null, fieldName_dag: null,
            fieldName_seizoen: null, fieldName_decade: null,
            sort_order: 0,
        };
        this.editReportVisible = true;
    }

    openEditReport() {
        const r = this.selectedReport;
        if (!r) return;
        this.editReportIsNew = false;
        this.editReport = {
            id: r.id, name: r.name, timebase: r.timebase,
            input_station:         !!r.input_station,
            input_neerslagstation: !!r.input_neerslagstation,
            input_jaar:            !!r.input_jaar,
            input_maand:           !!r.input_maand,
            input_week:            !!r.input_week,
            input_dag:             !!r.input_dag,
            input_seizoen:         !!r.input_seizoen,
            input_decade:          !!r.input_decade,
            fieldName_station:         r.fieldName_station         || null,
            fieldName_neerslagstation: r.fieldName_neerslagstation || null,
            fieldName_jaar:            r.fieldName_jaar            || null,
            fieldName_maand:           r.fieldName_maand           || null,
            fieldName_week:            r.fieldName_week            || null,
            fieldName_dag:             r.fieldName_dag             || null,
            fieldName_seizoen:         r.fieldName_seizoen         || null,
            fieldName_decade:          r.fieldName_decade          || null,
            sort_order:            r.sort_order ?? 0,
        };
        this.reportColumns = [];
        this.loadReportColumns();
        this.editReportVisible = true;
    }

    loadReportColumns() {
        if (!this.editReport.id) return;
        this.svc.getReportColumns(this.editReport.id).subscribe({
            next: (res: any) => { this.reportColumns = res.columns || []; },
            error: () => { this.reportColumns = []; }
        });
    }

    onEditReportFieldNameChange(type: string) {
        if (!this.editReport['fieldName_' + type]) {
            this.editReport['input_' + type] = false;
        }
    }

    saveEditReport() {
        this.editSaving = true;
        if (this.editReportIsNew) {
            const body = { ...this.editReport, dataset_id: this.selectedDataset?.id };
            delete body.id;
            this.svc.createReport(body).subscribe({
                next: () => {
                    this.editSaving = this.editReportVisible = this.editReportIsNew = false;
                    const prevTb = body.timebase;
                    this.svc.getDatasets().subscribe(data => {
                        this.datasets         = data;
                        this.selectedTimebase = prevTb;
                        this.execute();
                    });
                },
                error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message; }
            });
        } else {
            const { id, ...body } = this.editReport;
            this.svc.updateReport(id, body).subscribe({
                next: () => {
                    this.editSaving = false;
                    this.editReportVisible = false;
                    const ds = this.datasets.find(d => d.id === this.selectedDatasetId);
                    if (ds) {
                        const tb = ds.timebases.find((r: any) => r.id === id);
                        if (tb) { Object.assign(tb, body); this.selectedTimebase = body.timebase; }
                    }
                    // re-apply filters since fieldName_* may have changed
                    this.resetData();
                    this.buildMandatoryFilterOptions();
                    if (this.canExecute) this.execute();
                },
                error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message; }
            });
        }
    }

    // ── Edit query / chart configs ─────────────────────────────────────────────

    openEditQuery() {
        const r = this.selectedReport;
        if (!r) return;
        this.editQueryVisible = true;
        this.editQueryText = '';
        this.svc.getReport(r.id).subscribe({
            next:  (full: any) => { this.editQueryText = full.query ?? ''; },
            error: (err: any)  => { this.errorMessage = err.error?.error || err.message; this.editQueryVisible = false; }
        });
    }

    saveEditQuery() {
        const r = this.selectedReport;
        if (!r) return;
        this.editSaving = true;
        this.svc.updateReport(r.id, { query: this.editQueryText }).subscribe({
            next: () => { this.editSaving = false; this.editQueryVisible = false; r.query = this.editQueryText; },
            error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message; }
        });
    }

    openEditAnychart() {
        const r = this.selectedReport;
        if (!r) return;
        this.editAnychartText    = r.anychart_config || this.selectedDataset?.anychart_config || '';
        this.editAnychartVisible = true;
    }

    saveEditAnychart() {
        const r = this.selectedReport;
        if (!r) return;
        this.editSaving = true;
        this.svc.updateReport(r.id, { anychart_config: this.editAnychartText || null }).subscribe({
            next: () => {
                this.editSaving = false;
                this.editAnychartVisible = false;
                r.anychart_config = this.editAnychartText || null;
                this.anychartConfig = this.editAnychartText || null;
            },
            error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message; }
        });
    }

    openEditChartjs() {
        const r = this.selectedReport;
        if (!r) return;
        this.editChartjsText    = r.chartjs_config || this.selectedDataset?.chartjs_config || '';
        this.editChartjsVisible = true;
    }

    saveEditChartjs() {
        const r = this.selectedReport;
        if (!r) return;
        this.editSaving = true;
        this.svc.updateReport(r.id, { chartjs_config: this.editChartjsText || null }).subscribe({
            next: () => {
                this.editSaving = false;
                this.editChartjsVisible = false;
                r.chartjs_config = this.editChartjsText || null;
                this.chartjsConfig = this.editChartjsText || null;
            },
            error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message; }
        });
    }

    openEditDatasetAnychart() {
        const ds = this.selectedDataset;
        if (!ds) return;
        this.editDatasetAnychartText    = ds.anychart_config || '';
        this.editDatasetAnychartVisible = true;
    }

    saveEditDatasetAnychart() {
        const ds = this.selectedDataset;
        if (!ds) return;
        this.editSaving = true;
        this.svc.updateDataset(ds.id, { anychart_config: this.editDatasetAnychartText || null }).subscribe({
            next: () => {
                this.editSaving = false;
                this.editDatasetAnychartVisible = false;
                ds.anychart_config = this.editDatasetAnychartText || null;
                this.refreshChartConfig();
            },
            error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message || 'Er is een fout opgetreden'; }
        });
    }

    openEditDatasetChartjs() {
        const ds = this.selectedDataset;
        if (!ds) return;
        this.editDatasetChartjsText    = ds.chartjs_config || '';
        this.editDatasetChartjsVisible = true;
    }

    saveEditDatasetChartjs() {
        const ds = this.selectedDataset;
        if (!ds) return;
        this.editSaving = true;
        this.svc.updateDataset(ds.id, { chartjs_config: this.editDatasetChartjsText || null }).subscribe({
            next: () => {
                this.editSaving = false;
                this.editDatasetChartjsVisible = false;
                ds.chartjs_config = this.editDatasetChartjsText || null;
                this.refreshChartConfig();
            },
            error: (err: any) => { this.editSaving = false; this.errorMessage = err.error?.error || err.message || 'Er is een fout opgetreden'; }
        });
    }

    // ── Config save / load ─────────────────────────────────────────────────────

    saveConfig() {
        const ds = this.selectedDataset;
        if (!ds) return;
        this.svc.exportDataset(ds.id).subscribe({
            next: (config: any) => {
                const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url; a.download = `knmi-${ds.name.toLowerCase().replace(/\s+/g, '-')}-config.json`;
                a.click();
                URL.revokeObjectURL(url);
            },
            error: (err: any) => { this.errorMessage = err.error?.error || err.message; }
        });
    }

    onConfigFileSelected(event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try   { this.applyConfig(JSON.parse(e.target?.result as string)); }
            catch { this.errorMessage = 'Ongeldig JSON bestand'; }
        };
        reader.readAsText(file);
        (event.target as HTMLInputElement).value = '';
    }

    private applyConfig(config: any) {
        if (!config?.dataset || !config?.reports) { this.errorMessage = 'Ongeldig config formaat'; return; }
        const configDataset = config.dataset;
        const configReports = config.reports as any[];

        const buildDsBody = (categoryId: number | null) => {
            const dsBody: any = {};
            for (const key of ['code','name','chartYn','anychart_config','chartjs_config','sort_order']) {
                if (key in configDataset) dsBody[key] = configDataset[key];
            }
            dsBody.category_id = categoryId;
            return dsBody;
        };

        const applyReports = (datasetId: number, timebases: any[]) => {
            const ops: Observable<any>[] = [];
            for (const r of configReports) {
                const tb = timebases.find((t: any) => t.timebase === r.timebase);
                if (tb) ops.push(this.svc.updateReport(tb.id, r));
                else    ops.push(this.svc.createReport({ ...r, dataset_id: datasetId }));
            }
            const errMsg = (err: any) => err.error?.error || err.message || 'Er is een fout opgetreden';
            const reload = () => {
                const prevId = this.selectedDatasetId;
                const prevTb = this.selectedTimebase;
                this.svc.getDatasets().subscribe({
                    next: data => {
                        this.datasets          = data;
                        this.selectedDatasetId = prevId;
                        this.selectedTimebase  = prevTb;
                        const freshDs = this.datasets.find((d: any) => d.id === prevId);
                        const freshRp = freshDs?.timebases?.find((r: any) => r.timebase === prevTb);
                        this.anychartConfig = freshRp?.anychart_config || freshDs?.anychart_config || null;
                        this.chartjsConfig  = freshRp?.chartjs_config  || freshDs?.chartjs_config  || null;
                        this.errorMessage   = null;
                        this.importStatus  = 'Config geladen ✓';
                        setTimeout(() => { this.importStatus = null; }, 3000);
                        if (this.canExecute) this.execute();
                    },
                    error: (err: any) => { this.importStatus = null; this.errorMessage = errMsg(err); }
                });
            };
            if (ops.length) forkJoin(ops).subscribe({ next: reload, error: (err: any) => { this.importStatus = null; this.errorMessage = errMsg(err); } });
            else reload();
        };

        const topErrMsg = (err: any) => err.error?.error || err.message || 'Er is een fout opgetreden';
        this.importStatus = 'Bezig met importeren...';

        const proceed = (categoryId: number | null) => {
            const dsBody  = buildDsBody(categoryId);
            const existing = this.datasets.find(d => d.code && d.code === configDataset.code);
            if (existing) {
                this.svc.updateDataset(existing.id, dsBody).subscribe({
                    next:  () => applyReports(existing.id, existing.timebases ?? []),
                    error: (err: any) => { this.importStatus = null; this.errorMessage = topErrMsg(err); }
                });
            } else {
                this.svc.createDataset(dsBody).subscribe({
                    next:  (res: any) => applyReports(res.id, []),
                    error: (err: any) => { this.importStatus = null; this.errorMessage = topErrMsg(err); }
                });
            }
        };

        const catCode = configDataset.category_code;
        if (catCode) {
            const existingCat = this.categories.find((c: any) => c.code === catCode);
            if (existingCat) {
                proceed(existingCat.id);
            } else {
                this.svc.createCategory({ code: catCode, name: configDataset.category_name || catCode, sort_order: 0 }).subscribe({
                    next: (res: any) => {
                        this.svc.getCategories().subscribe(data => { this.categories = data; });
                        proceed(res.id);
                    },
                    error: (err: any) => { this.importStatus = null; this.errorMessage = topErrMsg(err); }
                });
            }
        } else {
            proceed(configDataset.category_id ?? null);
        }
    }

    // ── Export ─────────────────────────────────────────────────────────────────

    exportExcel() {
        const rows = this.filteredRows;
        if (!rows.length) return;
        this.excelExportService.generateExcel(rows, this.selectedDataset?.name || 'knmidata');
    }

    // ── Setup dialog ──────────────────────────────────────────────────────────

    setupVisible = false;
    setupModel: any = {};

    openSetup() {
        const stored = this.localStorage.getData(SETTINGS_KEY);
        const saved  = stored ? JSON.parse(stored) : {};
        this.setupModel = {
            datasetId:       saved.datasetId       ?? null,
            timebase:        saved.timebase        ?? null,
            outputMode:      saved.outputMode      ?? null,
            station:         saved.station         ?? null,
            neerslagstation: saved.neerslagstation ?? null,
        };
        this.setupVisible = true;
    }

    get setupDatasetTimebases(): { value: string; label: string }[] {
        const ds = this.datasets.find((d: any) => d.id === this.setupModel?.datasetId);
        if (!ds?.timebases?.length) return this.timebaseOptions;
        return ds.timebases.map((t: any) => ({ value: t.timebase, label: this.timebaseLabels[t.timebase] || t.timebase }));
    }

    saveSetup() {
        this.localStorage.saveData(SETTINGS_KEY, JSON.stringify(this.setupModel));
        if (this.setupModel.outputMode) this.outputMode = this.setupModel.outputMode;
        this.setupVisible = false;
    }

    private applyStoredDefaults() {
        this.resetFilterValues();
        let datasetId: number | null = null;
        let timebase: string | null = null;
        let outputMode: string | null = null;
        const stored = this.localStorage.getData(SETTINGS_KEY);
        if (stored) {
            try {
                ({ datasetId, timebase, outputMode } = JSON.parse(stored));
            } catch { /* ignore */ }
        }
        if (outputMode) this.outputMode = outputMode as any;
        const targetId = datasetId ?? this.datasets[0]?.id ?? null;
        if (targetId) {
            this.selectedDatasetId = targetId;
            if (timebase) this.selectedTimebase = timebase;
            this.onDatasetChange();
            setTimeout(() => {
                if (this.selectedReport && !this.loading) this.execute();
            }, 0);
        }
    }

    // ── Layout ─────────────────────────────────────────────────────────────────

    private removeLayoutResponsive() {
        this.style = document.createElement('style');
        this.style.innerHTML = `.layout-content { width: 100%; } .layout-topbar { width: 100%; }`;
        document.head.appendChild(this.style);
    }

    ngOnDestroy() {
        document.head.removeChild(this.style);
    }
}
