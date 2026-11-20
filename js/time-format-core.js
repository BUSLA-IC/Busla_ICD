/**
 * Pure playback time & duration formatting helpers.
 * Automatically converts minutes >= 60 (totalSeconds >= 3600) into H:MM:SS.
 */

export function formatPlaybackTime(seconds) {
    const num = Number(seconds);
    if (!Number.isFinite(num) || num <= 0) return '00:00';

    const totalSeconds = Math.floor(num);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const mm = String(minutes).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
}

export function formatDurationString(rawTime) {
    if (rawTime === null || rawTime === undefined || rawTime === '') return '';
    const str = String(rawTime).trim();
    if (!str) return '';

    if (!str.includes(':') && !Number.isNaN(Number(str))) {
        return formatPlaybackTime(Number(str));
    }

    if (str.includes('T')) {
        const match = str.match(/T(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
            const totalSeconds =
                parseInt(match[1], 10) * 3600 +
                parseInt(match[2], 10) * 60 +
                parseInt(match[3], 10);
            return formatPlaybackTime(totalSeconds);
        }
    }

    if (str.includes(':')) {
        const parts = str.split(':').map((p) => Number(p));
        if (parts.every((n) => Number.isFinite(n) && n >= 0)) {
            if (parts.length === 3) {
                return formatPlaybackTime(parts[0] * 3600 + parts[1] * 60 + parts[2]);
            }
            if (parts.length === 2) {
                return formatPlaybackTime(parts[0] * 60 + parts[1]);
            }
        }
    }

    return str;
}
