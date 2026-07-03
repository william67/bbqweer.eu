import { Observable } from 'rxjs';

export interface AreaPoint { lat: number; lng: number; }

export interface Area {
    id?: number;
    name: string;
    description?: string | null;
    color: string;
    active?: number;
    points: AreaPoint[];
    incidentCount?: number;
}

export interface AreaCrudService {
    getAreas(): Observable<Area[]>;
    createArea(area: Area): Observable<any>;
    updateArea(id: number, area: Partial<Area>): Observable<any>;
    updateAreaPoints(id: number, points: AreaPoint[]): Observable<any>;
    deleteArea(id: number): Observable<any>;
}
