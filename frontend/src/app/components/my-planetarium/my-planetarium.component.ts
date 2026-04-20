import { Component, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { StarsService, Star } from 'src/app/services/stars.service';
import { PlanetariumCalcService, PlanetInfo } from 'src/app/services/planetarium-calc.service';
import { SatellitesService, SatellitePosition, PassInfo } from 'src/app/services/satellites.service';

interface PlottedStar { star: Star; x: number; y: number; hitR: number; }

@Component({
    selector: 'app-my-planetarium',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, SlicePipe, SelectModule],
    templateUrl: './my-planetarium.component.html',
    styleUrls: ['./my-planetarium.component.css']
})
export class MyPlanetariumComponent implements AfterViewInit, OnDestroy {

    @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

    lat =  52.0;
    lng =   5.0;

    loading = true;
    currentTime = new Date();
    isActualTime = true;
    renderMs = 0;
    hoveredStar: Star | null = null;
    hoveredSat: SatellitePosition | null = null;
    tooltipX = 0;
    tooltipY = 0;
    showSatList = false;
    showPasses = false;
    passes: PassInfo[] = [];
    computingPasses = false;
    passFilterSatnum: string | null = null;
    passSatOptions: { label: string; value: string }[] = [];
    passHours = 24;
    passMinElev = 5;
    passHoursOptions = [
        { label: '6 hours',  value: 6  },
        { label: '12 hours', value: 12 },
        { label: '24 hours', value: 24 },
        { label: '48 hours', value: 48 },
    ];
    passMinElevOptions = [
        { label: '1°',  value: 1  },
        { label: '5°',  value: 5  },
        { label: '10°', value: 10 },
        { label: '20°', value: 20 },
        { label: '30°', value: 30 },
    ];

    viewMode: 'dome' | 'horizon' = 'dome';

    viewAz  = 180;
    viewAlt =   0;
    horizonFov = 90;

    private stars: Star[] = [];
    private plotted: PlottedStar[] = [];
    private plottedSats: { sat: SatellitePosition; x: number; y: number }[] = [];
    private ctx!: CanvasRenderingContext2D;

    private cx = 350;
    private cy = 350;
    private radius = 330;
    private HRZ_W = 900;
    private HRZ_H = 400;

    private resizeObserver!: ResizeObserver;

    domeRotation = 0;
    domeViewAlt  = 90;

    isDragging = false;
    private dragStartX      = 0;
    private dragStartY      = 0;
    private dragStartAz     = 0;
    private dragStartAlt    = 0;
    private dragStartAngle  = 0;
    private dragStartRotation = 0;

    private timer: any;

    satPositions: SatellitePosition[] = [];

    constructor(
        private starsService: StarsService,
        private calc: PlanetariumCalcService,
        public satellitesSvc: SatellitesService
    ) {}

    ngAfterViewInit(): void {
        this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
        this.updateSize();

        this.resizeObserver = new ResizeObserver(() => {
            this.updateSize();
            if (!this.loading) this.draw();
        });
        this.resizeObserver.observe(this.canvasRef.nativeElement);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => { this.lat = pos.coords.latitude; this.lng = pos.coords.longitude; this.loadStars(); },
                ()  => { this.loadStars(); }
            );
        } else {
            this.loadStars();
        }
    }

    private updateSize(): void {
        const canvas = this.canvasRef.nativeElement;
        if (this.viewMode === 'dome') {
            const size = canvas.parentElement!.clientWidth || 900;
            this.cx     = size / 2;
            this.cy     = size / 2;
            this.radius = size / 2 - 20;
            canvas.width  = size;
            canvas.height = size;
            canvas.style.width  = '100%';
            canvas.style.height = 'auto';
            canvas.style.display = 'block';
            canvas.style.margin  = '0';
        } else {
            const w = canvas.parentElement!.clientWidth  || 900;
            const h = canvas.parentElement!.clientHeight || 600;
            this.HRZ_W = w;
            this.HRZ_H = h;
            canvas.width  = w;
            canvas.height = h;
            canvas.style.width  = '100%';
            canvas.style.height = '100%';
        }
    }

    openPasses(): void {
        this.showPasses = !this.showPasses;
        if (this.showPasses) this.recomputePasses();
    }

    recomputePasses(): void {
        this.computingPasses = true;
        this.passes = [];
        this.passFilterSatnum = null;
        setTimeout(() => {
            this.passes = this.satellitesSvc.computePasses(new Date(), this.lat, this.lng, this.passHours, this.passMinElev);
            const seen = new Map<string, string>();
            for (const p of this.passes) {
                if (!seen.has(p.satnum)) seen.set(p.satnum, p.name);
            }
            this.passSatOptions = [
                { label: 'All satellites', value: '' },
                ...[...seen.entries()]
                    .map(([satnum, name]) => ({ label: `${name} (${satnum})`, value: satnum }))
                    .sort((a, b) => a.label.localeCompare(b.label))
            ];
            this.computingPasses = false;
        }, 10);
    }

    get filteredPasses(): PassInfo[] {
        if (!this.passFilterSatnum) return this.passes;
        return this.passes.filter(p => p.satnum === this.passFilterSatnum);
    }

    setViewMode(mode: 'dome' | 'horizon'): void {
        this.viewMode = mode;
        this.updateSize();
        if (mode === 'horizon') {
            this.viewAlt = 0;
        }
        this.draw();
    }

    private loadStars(): void {
        this.starsService.getStars(6.5).subscribe(stars => {
            this.stars = stars;
            this.loading = false;
            this.satellitesSvc.loadTles();
            this.draw();
            this.timer = setInterval(() => {
                if (this.isActualTime) this.currentTime = new Date();
                this.satPositions = this.satellitesSvc.getPositions(this.currentTime, this.lat, this.lng);
                this.draw();
            }, 200);
        });
    }

    draw(): void {
        if (!this.ctx) return;
        const t0 = performance.now();
        if (this.viewMode === 'dome') this.drawDome();
        else this.drawHorizon();
        this.renderMs = Math.round(performance.now() - t0);
    }

    private drawDome(): void {
        const ctx = this.ctx;
        const lst = this.calc.getLST(this.currentTime, this.lng);
        this.plotted = [];

        ctx.fillStyle = '#080818';
        ctx.fillRect(0, 0, this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height);

        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#08081a';
        ctx.fill();
        ctx.strokeStyle = '#2a3050';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        for (const ringAlt of [30, 60]) {
            ctx.beginPath();
            let first = true;
            for (let az = 0; az <= 360; az += 4) {
                const pos = this.projectDome(ringAlt, az % 360);
                if (!pos) { first = true; continue; }
                if (first) { ctx.moveTo(pos.x, pos.y); first = false; }
                else ctx.lineTo(pos.x, pos.y);
            }
            ctx.strokeStyle = '#1a1a30';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#4a5580';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const [label, az] of [['N',0],['S',180],['E',90],['W',270]] as [string,number][]) {
            const pos = this.projectDome(1, az);
            if (pos && Math.hypot(pos.x - this.cx, pos.y - this.cy) <= this.radius - 2) {
                ctx.fillText(label, pos.x, pos.y);
            }
        }
        ctx.textBaseline = 'alphabetic';

        ctx.save();
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
        ctx.clip();
        this.drawStars(lst, (alt, az) => this.projectDome(alt, az));
        this.drawSolarSystem(lst, (alt, az) => this.projectDome(alt, az));
        ctx.restore();
    }

    private projectDome(alt: number, az: number): { x: number; y: number } | null {
        const azAdj = ((az + this.domeRotation + 360) % 360);

        if (this.domeViewAlt >= 89.9) {
            return this.calc.project(alt, azAdj, this.cx, this.cy, this.radius);
        }

        const cAlt = this.domeViewAlt * Math.PI / 180;
        const cAz  = Math.PI;
        const aRad = alt   * Math.PI / 180;
        const azR  = azAdj * Math.PI / 180;

        const cosD = Math.sin(cAlt)*Math.sin(aRad) + Math.cos(cAlt)*Math.cos(aRad)*Math.cos(azR - cAz);
        const d = Math.acos(Math.max(-1, Math.min(1, cosD)));
        if (d > Math.PI / 2 + 0.001) return null;

        const bearY = -Math.cos(aRad) * Math.sin(azR - cAz);
        const bearX =  Math.cos(cAlt) * Math.sin(aRad) - Math.sin(cAlt) * Math.cos(aRad) * Math.cos(azR - cAz);
        const bearing = Math.atan2(bearY, bearX);

        const r = (d / (Math.PI / 2)) * this.radius;
        return {
            x: this.cx - r * Math.sin(bearing),
            y: this.cy - r * Math.cos(bearing)
        };
    }

    private drawHorizon(): void {
        const ctx  = this.ctx;
        const W    = this.HRZ_W;
        const H    = this.HRZ_H;
        const lst  = this.calc.getLST(this.currentTime, this.lng);
        const scale = W / this.horizonFov;
        const centreY = H;
        const hrzY  = centreY + this.viewAlt * scale;
        this.plotted = [];

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, Math.min(hrzY, H));
        ctx.clip();

        const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.min(hrzY, H));
        skyGrad.addColorStop(0, '#04040e');
        skyGrad.addColorStop(1, '#0a0a28');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = '#2a3050';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, hrzY);
        ctx.lineTo(W, hrzY);
        ctx.stroke();

        for (let alt = 0; alt <= 90; alt += 15) {
            const y = centreY - (alt - this.viewAlt) * scale;
            if (y < 0 || y > H) continue;
            ctx.strokeStyle = '#1a1a2e';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([4, 8]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#2a304a';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${alt}°`, 4, y - 2);
        }

        const tickY = Math.min(hrzY, H);
        for (let az = 0; az < 360; az += 10) {
            const dx = this.azDelta(az, this.viewAz);
            if (Math.abs(dx) > this.horizonFov / 2 + 5) continue;
            const x = W / 2 + dx * scale;
            ctx.strokeStyle = '#2a3050';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(x, tickY);
            ctx.lineTo(x, tickY - 8);
            ctx.stroke();

            if (az % 30 === 0) {
                const label = this.azLabel(az);
                ctx.fillStyle = '#4a5580';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(label, x, tickY - 12);
            }
        }

        const projectHrz = (alt: number, az: number): { x: number; y: number } | null => {
            if (alt < -30 / scale) return null;
            const dx = this.azDelta(az, this.viewAz);
            if (Math.abs(dx) > this.horizonFov / 2 + 2) return null;
            return { x: W / 2 + dx * scale, y: centreY - (alt - this.viewAlt) * scale };
        };
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, Math.min(hrzY, H));
        ctx.clip();
        this.drawStars(lst, projectHrz);
        this.drawSolarSystem(lst, projectHrz);
        ctx.restore();

        const labelBaseY = Math.min(tickY - 26, H - 10);
        ctx.fillStyle = '#3a4060';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Looking ${this.azLabel(this.viewAz)} (${Math.round(this.viewAz)}°)  —  FOV ${Math.round(this.horizonFov)}°`, W / 2, labelBaseY);

        ctx.fillStyle = '#2a3050';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('← drag to pan →', W - 8, labelBaseY);

        ctx.restore();
    }

    private drawStars(lst: number, project: (alt: number, az: number) => { x: number; y: number } | null): void {
        const ctx = this.ctx;
        for (const star of this.stars) {
            const { alt, az } = this.calc.raDecToAltAz(star.RA, star.Decl, lst, this.lat);
            const pos = project(alt, az);
            if (!pos) continue;

            const r     = this.calc.getStarRadius(star.Mag);
            const color = this.calc.getStarColor(star.Spectrum);

            if (star.Mag < 2) {
                const g = ctx.createRadialGradient(pos.x, pos.y, r, pos.x, pos.y, r * 3.5);
                g.addColorStop(0, color + '55');
                g.addColorStop(1, 'transparent');
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, r * 3.5, 0, Math.PI * 2);
                ctx.fillStyle = g;
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            if (star.ProperName) {
                ctx.fillStyle = '#7a8aaa';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(star.ProperName, pos.x + r + 3, pos.y + 3);
            }

            this.plotted.push({ star, x: pos.x, y: pos.y, hitR: Math.max(r, 5) });
        }
    }

    private drawSolarSystem(lst: number, project: (alt: number, az: number) => { x: number; y: number } | null): void {
        const pxPerDeg = this.viewMode === 'horizon'
            ? this.HRZ_W / this.horizonFov
            : this.radius / 90;
        const bodyR = Math.max(10, pxPerDeg);

        const sun = this.calc.getSunPosition(this.currentTime);
        const { alt: sAlt, az: sAz } = this.calc.raDecToAltAz(sun.ra, sun.dec, lst, this.lat);
        const sunPos = project(sAlt, sAz);
        if (sunPos) this.drawSun(sunPos.x, sunPos.y, bodyR);

        const moon = this.calc.getMoonPosition(this.currentTime);
        const { alt: mAlt, az: mAz } = this.calc.raDecToAltAz(moon.ra, moon.dec, lst, this.lat);
        const moonPos = project(mAlt, mAz);
        if (moonPos) this.drawMoon(moonPos.x, moonPos.y, moon.phase, moon.waxing, bodyR);

        for (const planet of this.calc.getPlanetPositions(this.currentTime)) {
            const { alt, az } = this.calc.raDecToAltAz(planet.ra, planet.dec, lst, this.lat);
            const pos = project(alt, az);
            if (pos) this.drawPlanet(pos.x, pos.y, planet);
        }

        this.drawSatellites(project);
    }

    private drawSatellites(project: (alt: number, az: number) => { x: number; y: number } | null): void {
        const ctx = this.ctx;
        this.plottedSats = [];
        for (const sat of this.satPositions) {
            const pos = project(sat.alt, sat.az);
            if (!pos) continue;
            this.plottedSats.push({ sat, x: pos.x, y: pos.y });
            const isHovered = this.hoveredSat === sat;
            const color = isHovered ? '#ffdd44' : '#ffffff';
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = isHovered ? 1.5 : 1;
            const b = isHovered ? 3 : 2;
            ctx.fillRect(pos.x - b, pos.y - b, b * 2, b * 2);
            const pw = isHovered ? 7 : 5;
            ctx.beginPath();
            ctx.moveTo(pos.x - b - pw, pos.y);
            ctx.lineTo(pos.x - b, pos.y);
            ctx.moveTo(pos.x + b, pos.y);
            ctx.lineTo(pos.x + b + pw, pos.y);
            ctx.stroke();
            if (isHovered || sat.name.includes('ISS') || sat.name.includes('ZARYA') || sat.name.includes('CSS') || sat.name.includes('TIANGONG')) {
                ctx.fillStyle = isHovered ? '#ffdd44' : '#88aaff';
                ctx.font = isHovered ? 'bold 11px sans-serif' : 'bold 10px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(sat.name, pos.x + 5, pos.y);
                ctx.textBaseline = 'alphabetic';
            }
        }
    }

    private drawSun(x: number, y: number, r: number): void {
        const ctx = this.ctx;
        const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3);
        g.addColorStop(0, 'rgba(255,220,80,0.6)');
        g.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe060';
        ctx.fill();
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Sun', x + r + 3, y);
        ctx.textBaseline = 'alphabetic';
    }

    private drawMoon(x: number, y: number, phase: number, waxing: boolean, r: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        if (!waxing) ctx.scale(-1, 1);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#0a0a18';
        ctx.fillRect(-r - 1, -r - 1, 2 * r + 2, 2 * r + 2);
        const semi_x = r * Math.abs(1 - 2 * phase);
        ctx.beginPath();
        if (phase < 0.5) {
            ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
            ctx.ellipse(0, 0, semi_x, r, 0, Math.PI / 2, -Math.PI / 2, true);
        } else {
            ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
            ctx.ellipse(0, 0, semi_x, r, 0, Math.PI / 2, -Math.PI / 2, false);
        }
        ctx.fillStyle = '#d0d0c0';
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Moon', x + r + 3, y);
        ctx.textBaseline = 'alphabetic';
    }

    private drawPlanet(x: number, y: number, planet: PlanetInfo): void {
        const ctx = this.ctx;
        const r = planet.sizePx;
        if (r >= 4) {
            const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.5);
            g.addColorStop(0, planet.color + '99');
            g.addColorStop(1, planet.color + '00');
            ctx.beginPath();
            ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = planet.color;
        ctx.fill();
        ctx.fillStyle = planet.color;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(planet.name, x + r + 3, y);
        ctx.textBaseline = 'alphabetic';
    }

    onMouseMove(event: MouseEvent): void {
        const rect  = this.canvasRef.nativeElement.getBoundingClientRect();
        const scaleX = this.canvasRef.nativeElement.width  / rect.width;
        const scaleY = this.canvasRef.nativeElement.height / rect.height;
        const mx = (event.clientX - rect.left) * scaleX;
        const my = (event.clientY - rect.top)  * scaleY;

        if (this.isDragging && this.viewMode === 'dome') {
            const angle = Math.atan2(mx - this.cx, -(my - this.cy)) * 180 / Math.PI;
            this.domeRotation = this.dragStartRotation - (angle - this.dragStartAngle);
            this.draw();
            return;
        }

        if (this.isDragging && this.viewMode === 'horizon') {
            const degPerPixel = this.horizonFov / rect.width;
            const dx = event.clientX - this.dragStartX;
            const dy = event.clientY - this.dragStartY;
            this.viewAz = ((this.dragStartAz - dx * degPerPixel) % 360 + 360) % 360;
            this.viewAlt = Math.max(0, Math.min(90, this.dragStartAlt + dy * degPerPixel));
            this.draw();
            return;
        }

        const hit = this.plotted.find(s => Math.hypot(s.x - mx, s.y - my) <= s.hitR + 3);
        this.hoveredStar = hit?.star ?? null;
        const hitSat = this.plottedSats.find(s => Math.hypot(s.x - mx, s.y - my) <= 10);
        const newHoveredSat = hitSat?.sat ?? null;
        if (newHoveredSat !== this.hoveredSat) { this.hoveredSat = newHoveredSat; this.draw(); }
        this.tooltipX = event.clientX + 14;
        this.tooltipY = event.clientY - 10;
    }

    onMouseDown(event: MouseEvent): void {
        if (this.viewMode === 'dome') {
            const rect = this.canvasRef.nativeElement.getBoundingClientRect();
            const scaleX = this.canvasRef.nativeElement.width / rect.width;
            const scaleY = this.canvasRef.nativeElement.height / rect.height;
            const mx = (event.clientX - rect.left) * scaleX;
            const my = (event.clientY - rect.top)  * scaleY;
            this.isDragging        = true;
            this.dragStartAngle    = Math.atan2(mx - this.cx, -(my - this.cy)) * 180 / Math.PI;
            this.dragStartRotation = this.domeRotation;
        } else if (this.viewMode === 'horizon') {
            this.isDragging   = true;
            this.dragStartX   = event.clientX;
            this.dragStartY   = event.clientY;
            this.dragStartAz  = this.viewAz;
            this.dragStartAlt = this.viewAlt;
        }
    }

    onMouseUp(): void    { this.isDragging = false; }
    onMouseLeave(): void { this.isDragging = false; this.hoveredStar = null; this.hoveredSat = null; }

    onWheel(event: WheelEvent): void {
        if (this.viewMode !== 'horizon') return;
        event.preventDefault();
        const oldScale = this.HRZ_W / this.horizonFov;
        const altAtCentre = this.viewAlt + this.HRZ_H / (2 * oldScale);
        const factor = event.deltaY > 0 ? 1.12 : 0.89;
        this.horizonFov = Math.min(180, Math.max(5, this.horizonFov * factor));
        const newScale = this.HRZ_W / this.horizonFov;
        this.viewAlt = Math.max(0, altAtCentre - this.HRZ_H / (2 * newScale));
        this.draw();
    }

    private azDelta(az: number, viewAz: number): number {
        let d = az - viewAz;
        if (d >  180) d -= 360;
        if (d < -180) d += 360;
        return d;
    }

    private azLabel(az: number): string {
        const dirs: [number, string][] = [
            [0,'N'],[45,'NE'],[90,'E'],[135,'SE'],
            [180,'S'],[225,'SW'],[270,'W'],[315,'NW'],[360,'N']
        ];
        const match = dirs.find(([d]) => Math.abs(az - d) < 23);
        return match ? match[1] : `${Math.round(az)}°`;
    }

    get editTimeValue(): string {
        const d = this.currentTime;
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }

    onTimeEdit(event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        if (val) { this.currentTime = new Date(val); this.isActualTime = false; this.draw(); }
    }

    setActualTime(): void {
        this.isActualTime = true;
        this.currentTime = new Date();
        this.draw();
    }

    get lstFormatted(): string {
        const lst = this.calc.getLST(this.currentTime, this.lng);
        const h = Math.floor(lst / 15);
        const m = Math.floor((lst % 15) * 4);
        return `LST ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`;
    }

    ngOnDestroy(): void {
        if (this.timer) clearInterval(this.timer);
        if (this.resizeObserver) this.resizeObserver.disconnect();
    }
}
