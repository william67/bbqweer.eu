import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LightningRoutingModule } from './lightning-routing.module';
import { LightningComponent } from './lightning.component';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import { AreaManagerModule } from 'src/app/components/area-manager/area-manager.module';

@NgModule({
    declarations: [LightningComponent],
    imports: [CommonModule, LightningRoutingModule, TooltipModule, ButtonModule, AreaManagerModule]
})
export class LightningModule {}
