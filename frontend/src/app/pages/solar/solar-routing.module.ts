import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SolarComponent } from './solar.component';

@NgModule({
    imports: [RouterModule.forChild([
        { path: '', component: SolarComponent }
    ])],
    exports: [RouterModule]
})
export class SolarRoutingModule { }
