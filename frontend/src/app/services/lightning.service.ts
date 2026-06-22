import { Injectable, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from 'src/environments/environment';

export interface Strike {
    lat:    number;
    lon:    number;
    timeMs: number;
    pol:    number;
    isNew?: boolean;
}

@Injectable({ providedIn: 'root' })
export class LightningService implements OnDestroy {

    private socket: Socket;

    constructor() {
        this.socket = io(environment.wsUrl, { transports: ['websocket'] });
    }

    initialList(): Observable<Strike[]> {
        return new Observable(obs => {
            const fn = (data: Strike[]) => obs.next(data);
            this.socket.on('initial-list', fn);
            return () => this.socket.off('initial-list', fn);
        });
    }

    newStrike(): Observable<Strike> {
        return new Observable(obs => {
            const fn = (data: Strike) => obs.next(data);
            this.socket.on('new-strike', fn);
            return () => this.socket.off('new-strike', fn);
        });
    }

    ngOnDestroy() {
        this.socket.disconnect();
    }
}
