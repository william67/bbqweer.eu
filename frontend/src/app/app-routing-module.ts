import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppLayoutComponent } from './layout/app.layout.component';

const routes: Routes = [
    {
        path: '',
        component: AppLayoutComponent,
        children: [
            { path: '', redirectTo: 'knmidata', pathMatch: 'full' },
            {
                path: 'knmidata',
                loadChildren: () => import('./pages/knmidata/knmidata.module').then(m => m.KnmiDataModule)
            },
            {
                path: 'planetarium',
                loadChildren: () => import('./pages/planetarium/planetarium.module').then(m => m.PlanetariumModule)
            },
            {
                path: 'energy-prices',
                loadChildren: () => import('./pages/energy-prices/energy-prices.module').then(m => m.EnergyPricesModule)
            }
        ]
    },
    { path: '**', redirectTo: 'knmidata' }
];

@NgModule({
    imports: [RouterModule.forRoot(routes, { useHash: true })],
    exports: [RouterModule]
})
export class AppRoutingModule {}
