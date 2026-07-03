import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FileAlertsComponent } from './file-alerts.component';

const routes: Routes = [{ path: '', component: FileAlertsComponent }];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class FileAlertsRoutingModule {}
