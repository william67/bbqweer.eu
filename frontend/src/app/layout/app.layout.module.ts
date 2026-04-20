import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { RippleModule } from 'primeng/ripple';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { StyleClassModule } from 'primeng/styleclass';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { MessageService } from 'primeng/api';
import { AppLayoutComponent } from './app.layout.component';
import { AppTopbarComponent } from './app.topbar.component';
import { AppFooterComponent } from './app.footer.component';
import { AppLoginComponent } from '../components/login/app.login.component';
import { ServerTasksComponent } from '../components/server-tasks/server-tasks.component';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';

@NgModule({
    declarations: [
        AppLayoutComponent,
        AppTopbarComponent,
        AppFooterComponent,
        AppLoginComponent,
        ServerTasksComponent
    ],
    imports: [
        CommonModule,
        BrowserModule,
        BrowserAnimationsModule,
        FormsModule,
        HttpClientModule,
        RouterModule,
        ButtonModule,
        SelectModule,
        RippleModule,
        DialogModule,
        InputTextModule,
        PasswordModule,
        ToastModule,
        StyleClassModule,
        TooltipModule,
        MenuModule,
        TableModule,
        TagModule,
        ProgressBarModule
    ],
    providers: [
        MessageService
    ],
    exports: [
        AppLayoutComponent
    ]
})
export class AppLayoutModule {}
