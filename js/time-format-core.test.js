import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPlaybackTime, formatDurationString } from './time-format-core.js';

test('formatPlaybackTime formats sub-hour durations as MM:SS', () => {
    assert.equal(formatPlaybackTime(0), '00:00');
    assert.equal(formatPlaybackTime(-5), '00:00');
    assert.equal(formatPlaybackTime(NaN), '00:00');
    assert.equal(formatPlaybackTime(9), '00:09');
    assert.equal(formatPlaybackTime(65), '01:05');
    assert.equal(formatPlaybackTime(3599), '59:59');
});

test('formatPlaybackTime converts 1 hour or more into H:MM:SS', () => {
    assert.equal(formatPlaybackTime(3600), '1:00:00');
    assert.equal(formatPlaybackTime(3661), '1:01:01');
    assert.equal(formatPlaybackTime(14401), '4:00:01');
    assert.equal(formatPlaybackTime(36000 + 540 + 5), '10:09:05');
});

test('formatDurationString normalizes raw seconds, ISO strings, and over-60-minute MM:SS strings', () => {
    assert.equal(formatDurationString(14401), '4:00:01');
    assert.equal(formatDurationString('240:01'), '4:00:01');
    assert.equal(formatDurationString('90:30'), '1:30:30');
    assert.equal(formatDurationString('00:45:10'), '45:10');
    assert.equal(formatDurationString('02:05:09'), '2:05:09');
    assert.equal(formatDurationString('1970-01-01T04:00:01'), '4:00:01');
    assert.equal(formatDurationString(''), '');
});
