import { Component, inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { AppUpdateService } from 'src/app/services/app-update.service';

@Component({
    selector: 'app-footer',
    templateUrl: './app.footer.component.html',
    standalone: false
})
export class AppFooterComponent {
    buildTime = environment.buildTime;
    updateService = inject(AppUpdateService);
}
