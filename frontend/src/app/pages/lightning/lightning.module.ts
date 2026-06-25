import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LightningRoutingModule } from './lightning-routing.module';
import { LightningComponent } from './lightning.component';
import { TooltipModule } from 'primeng/tooltip';

@NgModule({
    declarations: [LightningComponent],
    imports: [CommonModule, LightningRoutingModule, TooltipModule]
})
export class LightningModule {}
