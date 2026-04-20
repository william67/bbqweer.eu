import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlanetariumRoutingModule } from './planetarium-routing.module';
import { PlanetariumComponent } from './planetarium.component';
import { MyPlanetariumComponent } from 'src/app/components/my-planetarium/my-planetarium.component';

@NgModule({
    imports: [
        CommonModule,
        PlanetariumRoutingModule,
        MyPlanetariumComponent,
    ],
    declarations: [PlanetariumComponent]
})
export class PlanetariumModule {}
