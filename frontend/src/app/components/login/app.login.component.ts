import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Subscription, forkJoin, of } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { AuthService } from 'src/app/services/auth.service';
import { KnmiReportsService } from 'src/app/services/knmi-reports.service';
import { LocalStorageService } from 'src/app/services/local-storage.service';
import { MessageServiceWrapper } from 'src/app/services/message.service';
import { ServerTasksComponent } from '../server-tasks/server-tasks.component';

const SETTINGS_KEY = 'knmidata-settings';

@Component({
    selector: 'app-login',
    templateUrl: './app.login.component.html',
    standalone: false
})
export class AppLoginComponent implements OnInit, OnDestroy {

    @ViewChild('serverTasksDialog') serverTasksDialog!: ServerTasksComponent;

    menuItems: MenuItem[] = [];
    private authSub!: Subscription;

    // Login
    email: string = '';
    password: string = '';
    loginDialogVisible: boolean = false;

    // Edit Profile
    editProfileDialogVisible: boolean = false;
    editFirstName: string = '';
    editLastName: string = '';
    editNewPassword: string = '';
    editConfirmPassword: string = '';

    // Settings
    settingsDialogVisible: boolean = false;
    settingsDatasets: any[] = [];
    settingsStations: any[] = [];
    settingsNeerslagstations: any[] = [];
    settingsModel: any = {};

    constructor(
        public authService: AuthService,
        private knmiReports: KnmiReportsService,
        private localStorage: LocalStorageService,
        private messageService: MessageServiceWrapper
    ) {}

    ngOnInit() {
        this.buildMenu();
        this.authSub = this.authService.authChanged$.subscribe(() => this.buildMenu());
    }

    ngOnDestroy() {
        this.authSub?.unsubscribe();
    }

    private buildMenu() {
        if (this.authService.isLoggedIn) {
            this.menuItems = [
                { label: 'Edit Profile', icon: 'pi pi-user-edit', command: () => this.openEditProfileDialog() },
                { label: 'Standaard instellingen', icon: 'pi pi-cog', command: () => this.openSettingsDialog() },
                { label: 'Taakstatus', icon: 'pi pi-server', command: () => this.serverTasksDialog.open() },
                { separator: true },
                { label: 'Logout', icon: 'pi pi-power-off', command: () => this.logout() }
            ];
        } else {
            this.menuItems = [
                { label: 'Login', icon: 'pi pi-sign-in', command: () => this.openLoginDialog() }
            ];
        }
    }

    // ── Login ──────────────────────────────────────────────────────────────────

    openLoginDialog() {
        this.email = '';
        this.password = '';
        this.loginDialogVisible = true;
    }

    login() {
        this.authService.userLogin({ email: this.email, password: this.password }).subscribe({
            next: () => {
                this.loginDialogVisible = false;
                this.messageService.showMessage('success', 'Login successful', `Welcome ${this.authService.firstName}`);
            },
            error: (err) => this.messageService.showMessage('error', 'Login failed', err.message)
        });
    }

    logout() {
        this.authService.logout();
    }

    // ── Edit Profile ───────────────────────────────────────────────────────────

    openEditProfileDialog() {
        this.editFirstName = this.authService.firstName;
        this.editLastName = this.authService.lastName;
        this.editNewPassword = '';
        this.editConfirmPassword = '';
        this.editProfileDialogVisible = true;
    }

    saveProfile() {
        if (!this.editFirstName || !this.editLastName) {
            this.messageService.showMessage('error', 'Validation', 'First and last name are required');
            return;
        }
        if (this.editNewPassword && this.editNewPassword !== this.editConfirmPassword) {
            this.messageService.showMessage('error', 'Validation', 'Passwords do not match');
            return;
        }
        const data: any = { firstName: this.editFirstName, lastName: this.editLastName };
        if (this.editNewPassword) data.password = this.editNewPassword;

        this.authService.updateProfile(data).subscribe({
            next: () => {
                this.editProfileDialogVisible = false;
                this.messageService.showMessage('success', 'Profile updated', 'Your profile has been saved');
            },
            error: (err) => this.messageService.showMessage('error', 'Error', err.message)
        });
    }

    // ── Settings ───────────────────────────────────────────────────────────────

    openSettingsDialog() {
        const stored = this.localStorage.getData(SETTINGS_KEY);
        this.settingsModel = stored ? JSON.parse(stored) : {};

        const datasets$ = this.settingsDatasets.length ? of(this.settingsDatasets) : this.knmiReports.getDatasets();
        const stations$ = this.settingsStations.length ? of(this.settingsStations) : this.knmiReports.getStations();
        const neerslag$ = this.settingsNeerslagstations.length ? of(this.settingsNeerslagstations) : this.knmiReports.getNeerslagStations();

        forkJoin([datasets$, stations$, neerslag$]).subscribe(([d, s, n]) => {
            this.settingsDatasets = d;
            this.settingsStations = s;
            this.settingsNeerslagstations = n;
            this.settingsDialogVisible = true;
        });
    }

    saveSettings() {
        this.localStorage.saveData(SETTINGS_KEY, JSON.stringify(this.settingsModel));
        this.settingsDialogVisible = false;
        this.messageService.showMessage('success', 'Instellingen opgeslagen', '');
    }
}
