import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
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

    readonly initialList$     = new Subject<Strike[]>();
    readonly newStrike$       = new Subject<Strike>();
    readonly lightningIndex$  = new BehaviorSubject<number>(0);
    readonly lightningDelay$  = new BehaviorSubject<{ avg: number; min: number; max: number; samples: number } | null>(null);

    constructor() {
        this.socket = io(environment.wsUrl, { transports: ['websocket'] });

        // Set up all listeners once in the constructor — service owns the connection
        this.socket.on('connect',         () => this.requestInitialList());
        this.socket.on('initial-list',    (list: Strike[]) => this.initialList$.next(list));
        this.socket.on('new-strike',      (s: Strike)      => this.newStrike$.next(s));
        this.socket.on('lightning-index', (n: number)      => this.lightningIndex$.next(n));
        this.socket.on('lightning-delay', (s: any)         => this.lightningDelay$.next(s));
    }

    // Called by the component when it mounts and socket is already connected
    requestInitialList(): void {
        this.socket.emit('get-initial-list');
    }

    get connected(): boolean { return this.socket.connected; }

    ngOnDestroy() { this.socket.disconnect(); }
}
