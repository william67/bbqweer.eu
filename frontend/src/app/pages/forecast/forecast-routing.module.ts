import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ForecastComponent } from './forecast.component';

@NgModule({
    imports: [RouterModule.forChild([
        { path: '', component: ForecastComponent }
    ])],
    exports: [RouterModule]
})
export class ForecastRoutingModule { }
