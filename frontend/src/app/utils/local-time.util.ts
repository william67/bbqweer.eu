// Local (Europe/Amsterdam) date and time of a UTC timestamp 'YYYY-MM-DDTHH:mm'. Open-Meteo is asked for UTC and converted here:
// with timezone=Europe/Amsterdam it applies the UTC offset of the first day to the whole response, so every hour after a
// summer/winter time change (25 Oct 2026) got a label one hour too late.

const TZ = 'Europe/Amsterdam';

const fmt = new Intl.DateTimeFormat('nl-NL', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function localDateTime(utc: string): { date: string; time: string } {
    const p: Record<string, string> = {};
    fmt.formatToParts(new Date(utc + 'Z')).forEach(x => p[x.type] = x.value);
    return { date: `${p['year']}-${p['month']}-${p['day']}`, time: `${p['hour']}:${p['minute']}` };
}
