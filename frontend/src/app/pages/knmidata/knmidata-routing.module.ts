import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { KnmiDataComponent } from './knmidata.component';
import { ForecastComponent } from './forecast/forecast.component';

@NgModule({
    imports: [RouterModule.forChild([
        { path: '', component: KnmiDataComponent },
        { path: 'forecast', component: ForecastComponent }
    ])],
    exports: [RouterModule]
})
export class KnmiDataRoutingModule { }
