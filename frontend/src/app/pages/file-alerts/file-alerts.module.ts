import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileAlertsRoutingModule } from './file-alerts-routing.module';
import { FileAlertsComponent } from './file-alerts.component';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { AreaManagerModule } from 'src/app/components/area-manager/area-manager.module';

@NgModule({
    declarations: [FileAlertsComponent],
    imports: [
        CommonModule,
        FormsModule,
        FileAlertsRoutingModule,
        ButtonModule,
        DialogModule,
        TableModule,
        AreaManagerModule,
    ]
})
export class FileAlertsModule {}
