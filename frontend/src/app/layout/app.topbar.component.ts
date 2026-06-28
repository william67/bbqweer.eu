import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { LightningService } from '../services/lightning.service';

@Component({
    selector: 'app-topbar',
    templateUrl: './app.topbar.component.html',
    standalone: false
})
export class AppTopbarComponent implements OnInit, OnDestroy {

    lightningActive = 0;
    lightningTotal  = 0;
    private sub?: Subscription;

    constructor(private lightningSvc: LightningService) {}

    ngOnInit(): void {
        this.sub = this.lightningSvc.lightningIndex$.subscribe(data => {
            this.lightningActive = data?.active ?? 0;
            this.lightningTotal  = data?.total  ?? 0;
        });
    }

    ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
