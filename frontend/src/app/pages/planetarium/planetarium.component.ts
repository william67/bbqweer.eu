import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-planetarium',
    templateUrl: './planetarium.component.html',
    styleUrls: ['./planetarium.component.css'],
    standalone: false
})
export class PlanetariumComponent implements OnInit, OnDestroy {
    private layoutContent!: HTMLElement | null;

    ngOnInit(): void {
        this.layoutContent = document.querySelector('.layout-content');
        if (this.layoutContent) {
            this.layoutContent.style.position = 'relative';
            this.layoutContent.style.padding  = '0';
        }
    }

    ngOnDestroy(): void {
        if (this.layoutContent) {
            this.layoutContent.style.position = '';
            this.layoutContent.style.padding  = '';
        }
    }
}
