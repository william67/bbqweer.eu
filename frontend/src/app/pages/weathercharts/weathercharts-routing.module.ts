import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { WeatherChartsComponent } from './weathercharts.component';

const routes: Routes = [{ path: '', component: WeatherChartsComponent }];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class WeatherChartsRoutingModule {}
