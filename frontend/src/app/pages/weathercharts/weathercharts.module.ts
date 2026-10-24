import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';
import { WeatherChartsRoutingModule } from './weathercharts-routing.module';
import { WeatherChartsComponent } from './weathercharts.component';

@NgModule({
    declarations: [WeatherChartsComponent],
    imports: [CommonModule, FormsModule, WeatherChartsRoutingModule, ButtonModule, SelectModule, SliderModule, CheckboxModule, MessageModule]
})
export class WeatherChartsModule {}
