import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LightningComponent } from './lightning.component';

const routes: Routes = [{ path: '', component: LightningComponent }];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class LightningRoutingModule {}
