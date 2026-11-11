import { describe, expect, it } from 'vitest';
import { convertUnit, evaluate, percentChange, percentOf, timeInZone, whatPercent, zoneOffset, zonedTimeToInstant } from '@/core/lib/utilities';

describe('calculator', () => {
  it('respects precedence, brackets, unary minus and powers', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('-3 + 5')).toBe(2);
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluate('-2 ^ 2')).toBe(-4);
    expect(evaluate('10 % 4 + 7 / 2')).toBe(5.5);
    expect(evaluate('1,200 × 1.18')).toBe(1416);
    expect(evaluate('0.1 + 0.2')).toBe(0.3);
  });
  it('supports functions and constants', () => {
    expect(evaluate('sqrt(16) + abs(-2)')).toBe(6);
    expect(evaluate('round(pi * 100) / 100')).toBe(3.14);
  });
  it('rejects malformed input with a message instead of evaluating code', () => {
    for (const bad of ['2 +', '(1 + 2', '1 / 0', 'alert(1)', '2 $ 3', '']) expect(() => evaluate(bad), bad).toThrow();
  });
});

describe('unit conversion', () => {
  it('converts within a category', () => {
    expect(convertUnit(1, 'km', 'm', 'length')).toBe(1000);
    expect(convertUnit(1, 'mi', 'km', 'length')).toBeCloseTo(1.609344);
    expect(convertUnit(2.5, 'kg', 'lb', 'mass')).toBeCloseTo(5.5116, 3);
    expect(convertUnit(1, 'GB', 'MB', 'data')).toBe(1024);
    expect(convertUnit(90, 'min', 'h', 'time')).toBe(1.5);
  });
  it('handles temperature scales', () => {
    expect(convertUnit(100, '°C', '°F', 'temperature')).toBe(212);
    expect(convertUnit(32, '°F', '°C', 'temperature')).toBe(0);
    expect(convertUnit(0, '°C', 'K', 'temperature')).toBe(273.15);
  });
  it('returns NaN for unknown units', () => {
    expect(convertUnit(1, 'km', 'kg', 'length')).toBeNaN();
  });
});

describe('time zones', () => {
  it('finds offsets, including half-hour zones and daylight saving', () => {
    expect(zoneOffset(new Date('2026-01-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(zoneOffset(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300);
    expect(zoneOffset(new Date('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240);
  });
  it('converts a wall-clock time in one zone to the same instant elsewhere', () => {
    const instant = zonedTimeToInstant('2026-11-10', '09:30', 'Asia/Kolkata');
    expect(instant.toISOString()).toBe('2026-11-10T04:00:00.000Z');
    expect(timeInZone(instant, 'Europe/London', false).time).toBe('04:00');
    expect(timeInZone(instant, 'Asia/Kolkata').offset).toBe('UTC+5:30');
    expect(zonedTimeToInstant('2026-07-01', '08:00', 'America/New_York').toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });
});

describe('percentages', () => {
  it('computes percent of, change and share', () => {
    expect(percentOf(15, 2400)).toBe(360);
    expect(percentChange(1800, 2100)).toBeCloseTo(16.667, 2);
    expect(percentChange(200, 150)).toBe(-25);
    expect(whatPercent(30, 120)).toBe(25);
    expect(percentChange(0, 5)).toBeNaN();
  });
});
