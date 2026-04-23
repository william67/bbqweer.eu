import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnergyPricesRoutingModule } from './energy-prices-routing.module';
import { EnergyPricesComponent } from './energy-prices.component';
import { ChartModule } from 'primeng/chart';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ButtonModule } from 'primeng/button';

@NgModule({
    imports: [
        CommonModule,
        EnergyPricesRoutingModule,
        ChartModule,
        MessageModule,
        ProgressSpinnerModule,
        ButtonModule
    ],
    declarations: [EnergyPricesComponent]
})
export class EnergyPricesModule { }
