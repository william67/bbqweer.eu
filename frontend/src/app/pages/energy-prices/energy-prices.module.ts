import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EnergyPricesRoutingModule } from './energy-prices-routing.module';
import { EnergyPricesComponent } from './energy-prices.component';
import { ChartModule } from 'primeng/chart';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        EnergyPricesRoutingModule,
        ChartModule,
        MessageModule,
        ProgressSpinnerModule,
        ButtonModule,
        DatePickerModule
    ],
    declarations: [EnergyPricesComponent]
})
export class EnergyPricesModule { }
