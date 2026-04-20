import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/services/auth.service';

interface Column {
    field:      string;
    header:     string;
    sort?:      string;
    format?:    string;
    decimals?:  number;
    flexWidth?: string;
}

@Component({
    selector: 'app-my-knmi-table',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, DialogModule, ButtonModule, InputTextModule, SelectModule],
    templateUrl: './my-knmi-table.component.html',
    styleUrls: ['./my-knmi-table.component.scss']
})
export class MyKnmiTableComponent implements OnChanges {
    @Input() tableData: any[] | undefined;
    @Input() tableFieldsToSkip: string[] | undefined;

    cols: Column[] = [];
    private columnMapping: any[] = [];
    private mappingLoaded = false;

    editDialogVisible = false;
    editField = '';
    editHeader = '';
    editDecimals: number | null = null;
    editSortField = '';
    editFormat = '';
    editFlexWidth = '';
    editSaving = false;
    editError: string | null = null;
    editIsNew = false;

    formatOptions = [
        { label: '(none)', value: '' },
        { label: 'number', value: 'number' },
    ];

    constructor(private http: HttpClient, public auth: AuthService) {
        this.loadMapping();
    }

    private loadMapping() {
        this.http.get<any[]>(`${environment.apiUrl}/knmi-reports/column-mapping`).subscribe({
            next: data => {
                this.columnMapping = data;
                this.mappingLoaded = true;
                if (this.tableData?.length) this.buildCols();
            },
            error: () => {
                this.mappingLoaded = true;
                if (this.tableData?.length) this.buildCols();
            }
        });
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['tableData'] && this.mappingLoaded) {
            this.buildCols();
        }
    }

    private buildCols() {
        const rows = this.tableData || [];
        if (!rows.length) { this.cols = []; return; }

        const skip = this.tableFieldsToSkip || [];
        const keys = Object.keys(rows[0]).filter(k => !skip.includes(k));

        this.cols = keys.map(key => {
            const isAggregation = key.startsWith('avg_') || key.startsWith('min_') || key.startsWith('max_');
            const mapping = this.columnMapping.find(m => m.field === key);

            const header = isAggregation
                ? `${key.split('_')[0].charAt(0).toUpperCase() + key.split('_')[0].slice(1)} ${mapping ? mapping.header : key.split('_')[1]}`
                : mapping ? mapping.header : key;

            return {
                field:     key,
                header,
                sort:      mapping?.sort_field || key,
                decimals:  mapping?.decimals   ?? undefined,
                format:    mapping?.format     || undefined,
                flexWidth: mapping?.flex_width || '5',
            };
        });
    }

    openEditMapping(col: Column) {
        if (!this.auth.isLoggedIn) return;
        const mapping = this.columnMapping.find(m => m.field === col.field);
        this.editIsNew     = !mapping;
        this.editField     = col.field;
        this.editHeader    = mapping?.header     || col.field;
        this.editDecimals  = mapping?.decimals   ?? null;
        this.editSortField = mapping?.sort_field || col.field;
        this.editFormat    = mapping?.format     || '';
        this.editFlexWidth = mapping?.flex_width || '';
        this.editError     = null;
        this.editDialogVisible = true;
    }

    saveEditMapping() {
        this.editSaving = true;
        this.editError  = null;
        const body = {
            field:      this.editField,
            header:     this.editHeader || null,
            decimals:   this.editDecimals,
            sort_field: this.editSortField || null,
            format:     this.editFormat    || null,
            flex_width: this.editFlexWidth || null,
        };

        const headers = { 'x-access-token': this.auth.jwtToken };
        const req$ = this.editIsNew
            ? this.http.post(`${environment.apiUrl}/knmi-reports/column-mapping`, body, { headers })
            : this.http.put(`${environment.apiUrl}/knmi-reports/column-mapping/${encodeURIComponent(this.editField)}`, body, { headers });

        req$.subscribe({
            next: () => {
                this.editSaving = false;
                this.editDialogVisible = false;
                this.loadMapping();
            },
            error: err => {
                this.editSaving = false;
                this.editError = err.error?.error || 'Opslaan mislukt';
            }
        });
    }

    getColType(field: string, format: string): any {
        if (field === 'datum') return 'datum';
        if (field.startsWith('time') || field.endsWith('Time') || field.endsWith('Timestamp')) return 'timestamp';
        if (format === 'number') return 'number';
        return 'default';
    }

    isNumber(value: any): boolean {
        return typeof value === 'number';
    }

    trackById(index: number, row: any) {
        return row.id ?? index;
    }
}
