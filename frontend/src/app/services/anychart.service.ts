import { Injectable } from '@angular/core';

declare const anychart: any;

@Injectable({
  providedIn: 'root'
})
export class AnyChartService {

  private isAnyChartLoaded = false;
  private scriptLoadPromise: Promise<void>;

  constructor() {
    this.scriptLoadPromise = this.detectOrLoad();
  }

  private detectOrLoad(): Promise<void> {
    if (typeof anychart !== 'undefined') {
      this.isAnyChartLoaded = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.anychart.com/releases/8.13.0/js/anychart-bundle.min.js';
      script.onload = () => { this.isAnyChartLoaded = true; resolve(); };
      script.onerror = (error) => reject(error);
      document.head.appendChild(script);
    });
  }

  initializeAnyChart(chartType: string): Promise<any> {
    return this.scriptLoadPromise.then(() => {
      if (!this.isAnyChartLoaded) return Promise.reject('AnyChart failed to load.');
      return anychart[chartType]?.();
    });
  }
}
