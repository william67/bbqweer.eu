import { Component, inject } from '@angular/core';
import { AppUpdateService } from 'src/app/services/app-update.service';

@Component({
    selector: 'app-layout',
    templateUrl: './app.layout.component.html',
    styles: [`
        .update-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 10000; padding: 0.6rem 1rem;
            background: #d32f2f; color: #fff; text-align: center; font-weight: 700; cursor: pointer; }
    `],
    standalone: false
})
export class AppLayoutComponent {
    updateService = inject(AppUpdateService);
}
