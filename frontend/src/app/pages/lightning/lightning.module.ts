import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LightningRoutingModule } from './lightning-routing.module';
import { LightningComponent } from './lightning.component';

@NgModule({
    declarations: [LightningComponent],
    imports: [CommonModule, LightningRoutingModule]
})
export class LightningModule {}
