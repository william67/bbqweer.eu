import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SolarRoutingModule } from './solar-routing.module';
import { SolarComponent } from './solar.component';
import { ChartModule } from 'primeng/chart';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        SolarRoutingModule,
        ChartModule,
        MessageModule,
        ProgressSpinnerModule,
        ButtonModule,
        InputNumberModule,
        SelectModule,
        DatePickerModule,
    ],
    declarations: [SolarComponent]
})
export class SolarModule { }
