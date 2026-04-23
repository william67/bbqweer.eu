import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { EnergyPricesComponent } from './energy-prices.component';

@NgModule({
    imports: [RouterModule.forChild([
        { path: '', component: EnergyPricesComponent }
    ])],
    exports: [RouterModule]
})
export class EnergyPricesRoutingModule { }
