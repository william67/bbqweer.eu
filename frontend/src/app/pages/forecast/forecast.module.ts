import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ForecastRoutingModule } from './forecast-routing.module';
import { ForecastComponent } from './forecast.component';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { MyWeatherChartComponent } from 'src/app/components/my-weather-chart/my-weather-chart.component';

@NgModule({
    imports: [
        CommonModule,
        ForecastRoutingModule,
        ButtonModule,
        MessageModule,
        DialogModule,
        TooltipModule,
        TableModule,
        MyWeatherChartComponent,
    ],
    declarations: [ForecastComponent]
})
export class ForecastModule { }
