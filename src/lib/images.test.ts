import { describe, it, expect } from 'vitest';
import { fitWithin } from './images';

describe('fitWithin', () => {
  it('leaves an already-small image alone rather than upscaling it', () => {
    expect(fitWithin(800, 600, 1400)).toEqual({ width: 800, height: 600 });
  });

  it('scales a landscape photo down by its long edge', () => {
    expect(fitWithin(4000, 3000, 1400)).toEqual({ width: 1400, height: 1050 });
  });

  it('scales a portrait photo down by its long edge', () => {
    expect(fitWithin(3000, 4000, 1400)).toEqual({ width: 1050, height: 1400 });
  });

  it('never rounds a dimension to zero on an extreme aspect ratio', () => {
    expect(fitWithin(10000, 3, 1400).height).toBe(1);
  });

  it('handles a square', () => {
    expect(fitWithin(2000, 2000, 1400)).toEqual({ width: 1400, height: 1400 });
  });
});
