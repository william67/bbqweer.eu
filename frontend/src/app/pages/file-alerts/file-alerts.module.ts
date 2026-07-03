import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileAlertsRoutingModule } from './file-alerts-routing.module';
import { FileAlertsComponent } from './file-alerts.component';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { ColorPickerModule } from 'primeng/colorpicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';

@NgModule({
    declarations: [FileAlertsComponent],
    imports: [
        CommonModule,
        FormsModule,
        FileAlertsRoutingModule,
        ButtonModule,
        DialogModule,
        TableModule,
        InputTextModule,
        ColorPickerModule,
        IconFieldModule,
        InputIconModule,
    ]
})
export class FileAlertsModule {}
