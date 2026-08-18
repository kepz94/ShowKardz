import { describe, it, expect } from 'vitest';
import { formatBytes } from './storage';

describe('formatBytes', () => {
  it('reads bytes below a kilobyte', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('reads kilobytes without a pointless decimal', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('keeps one decimal where it carries information', () => {
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
  });

  it('reads megabytes', () => {
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
  });

  it('reads gigabytes', () => {
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3 GB');
  });

  it('reads zero as zero, not as "0 undefined"', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
});
