import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RainRadarMapRoutingModule } from './rainradar-routing.module';
import { RainRadarMapComponent } from './rainradar.component';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { MyMapSettingsComponent } from 'src/app/components/my-map-settings/my-map-settings.component';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        RainRadarMapRoutingModule,
        ButtonModule,
        TooltipModule,
        SelectModule,
        DialogModule,
        DatePickerModule,
        MyMapSettingsComponent
    ],
    declarations: [RainRadarMapComponent]
})
export class RainRadarMapModule { }
