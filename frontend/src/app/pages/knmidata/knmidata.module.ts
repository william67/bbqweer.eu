import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KnmiDataComponent } from './knmidata.component';
import { KnmiDataRoutingModule } from './knmidata-routing.module';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { MenuModule } from 'primeng/menu';
import { TableModule } from 'primeng/table';
import { MyKnmiTableComponent } from 'src/app/components/my-knmi-table/my-knmi-table.component';
import { MyKnmiAnychartComponent } from 'src/app/components/my-knmi-anychart/my-knmi-anychart.component';
import { MyKnmiChartjsComponent } from 'src/app/components/my-knmi-chartjs/my-knmi-chartjs.component';
import { ForecastComponent } from './forecast/forecast.component';

@NgModule({
    imports: [
        CommonModule,
        KnmiDataRoutingModule,
        FormsModule,
        ButtonModule,
        SelectModule,
        MessageModule,
        TooltipModule,
        DialogModule,
        InputTextModule,
        TextareaModule,
        CheckboxModule,
        MenuModule,
        TableModule,
        MyKnmiTableComponent,
        MyKnmiAnychartComponent,
        MyKnmiChartjsComponent
    ],
    declarations: [KnmiDataComponent, ForecastComponent]
})
export class KnmiDataModule { }
