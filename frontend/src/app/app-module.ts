import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { AppLayoutModule } from './layout/app.layout.module';
import { MessageServiceWrapper } from './services/message.service';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

const AppPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50:  '{blue.50}',
            100: '{blue.100}',
            200: '{blue.200}',
            300: '{blue.300}',
            400: '{blue.400}',
            500: '{blue.500}',
            600: '{blue.600}',
            700: '{blue.700}',
            800: '{blue.800}',
            900: '{blue.900}',
            950: '{blue.950}'
        }
    }
});

@NgModule({
    declarations: [
        App
    ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        AppLayoutModule
    ],
    providers: [
        MessageServiceWrapper,
        providePrimeNG({
            theme: {
                preset: AppPreset,
                options: { darkModeSelector: '.app-dark' }
            },
            zIndex: {
                modal: 11000,
                overlay: 11000,
                menu: 11000,
                tooltip: 12000
            }
        })
    ],
    bootstrap: [App]
})
export class AppModule {
    constructor(private messageServiceWrapper: MessageServiceWrapper) {}
}
