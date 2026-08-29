import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { ColorPickerModule } from 'primeng/colorpicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { CheckboxModule } from 'primeng/checkbox';
import { AreaManagerComponent } from './area-manager.component';

@NgModule({
    declarations: [AreaManagerComponent],
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        DialogModule,
        TableModule,
        InputTextModule,
        ColorPickerModule,
        IconFieldModule,
        InputIconModule,
        CheckboxModule,
    ],
    exports: [AreaManagerComponent]
})
export class AreaManagerModule {}
