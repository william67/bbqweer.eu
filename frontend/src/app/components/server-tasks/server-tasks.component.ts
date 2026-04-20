import { Component, OnDestroy } from '@angular/core';
import { ServerTasksService } from 'src/app/services/server-tasks.service';

@Component({
    selector: 'app-server-tasks',
    templateUrl: './server-tasks.component.html',
    standalone: false
})
export class ServerTasksComponent implements OnDestroy {

    visible = false;
    tasks: any[] = [];
    private pollTimer: any;

    constructor(private svc: ServerTasksService) {}

    open() {
        this.visible = true;
        this.load();
        this.pollTimer = setInterval(() => this.load(), 2000);
    }

    close() {
        this.visible = false;
        clearInterval(this.pollTimer);
    }

    private load() {
        this.svc.getTasks().subscribe({
            next: data => this.tasks = data,
            error: () => {}
        });
    }

    progressValue(t: any): number {
        if (!t.progressTotal) return 0;
        return Math.round((t.currentProgress / t.progressTotal) * 100);
    }

    statusSeverity(t: any): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
        if (t.isRunning) return 'info';
        switch (t.lastStatus) {
            case 'success': return 'success';
            case 'partial': return 'warn';
            case 'error':   return 'danger';
            default:        return 'secondary';
        }
    }

    statusLabel(t: any): string {
        return t.isRunning ? 'running' : (t.lastStatus ?? '—');
    }

    ngOnDestroy() {
        clearInterval(this.pollTimer);
    }
}
