import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { LightningService } from '../services/lightning.service';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-topbar',
    templateUrl: './app.topbar.component.html',
    standalone: false
})
export class AppTopbarComponent implements OnInit, OnDestroy {

    lightningActive = 0;
    lightningTotal  = 0;
    private sub?: Subscription;

    constructor(private lightningSvc: LightningService, public authService: AuthService) {}

    ngOnInit(): void {
        this.sub = this.lightningSvc.lightningIndex$.subscribe(data => {
            this.lightningActive = data?.ceActive ?? 0;
            this.lightningTotal  = data?.ceTotal  ?? 0;
        });
    }

    ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
