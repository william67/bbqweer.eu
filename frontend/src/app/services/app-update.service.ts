import { Injectable, signal } from '@angular/core';

// Detects a newly deployed build (dev-standards frontend/version-check.md).
// The deploy script writes version.json next to index.html; this polls it and
// flags a change from the value seen at startup. Also flags a failed lazy-chunk
// load: a tab opened before a deploy asks for chunk files that no longer exist,
// and nginx answers those with index.html (the "text/html MIME type" error).
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  updateAvailable = signal(false);
  buildLabel      = signal('');

  private startupVersion: string | null = null;

  constructor() {
    this.check();
    setInterval(() => this.check(), 60_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
    window.addEventListener('unhandledrejection', e => {
      if (/dynamically imported module|Importing a module script failed/i.test(String(e.reason?.message ?? e.reason))) {
        this.updateAvailable.set(true);
      }
    });
  }

  private async check() {
    try {
      // Relative to <base href>, so it also resolves under a path prefix.
      const res = await fetch(new URL('version.json', document.baseURI).href, { cache: 'no-store' });
      if (!res.ok) return;                                  // no version.json in local dev
      const data = await res.json() as { version: string; build: string; date: string };
      if (this.startupVersion === null) {
        this.startupVersion = data.version;
        this.buildLabel.set(data.build);
      } else if (data.version !== this.startupVersion) {
        this.updateAvailable.set(true);
      }
    } catch {
      // offline, or the SPA fallback returned HTML — try again next interval
    }
  }

  reload() { window.location.reload(); }
}
