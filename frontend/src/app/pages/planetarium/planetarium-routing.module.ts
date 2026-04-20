import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PlanetariumComponent } from './planetarium.component';

const routes: Routes = [
    { path: '', component: PlanetariumComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PlanetariumRoutingModule {}
