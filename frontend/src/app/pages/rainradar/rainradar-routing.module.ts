import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { RainRadarMapComponent } from './rainradar.component';

@NgModule({
    imports: [RouterModule.forChild([
        { path: '', component: RainRadarMapComponent }
    ])],
    exports: [RouterModule]
})
export class RainRadarMapRoutingModule { }
