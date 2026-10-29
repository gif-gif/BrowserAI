import { describe, expect, it } from 'vitest';
import { calculateSelectionButtonPosition } from '../../../core/selection/selection-position';

describe('calculateSelectionButtonPosition', () => {
  it('centers above the selection when there is room', () => {
    expect(calculateSelectionButtonPosition(
      { left: 100, right: 200, top: 100, bottom: 120, width: 100, height: 20 },
      { width: 96, height: 36 },
      { width: 400, height: 300 },
    )).toEqual({ x: 102, y: 56, placement: 'above' });
  });

  it('moves below and clamps to the viewport near edges', () => {
    expect(calculateSelectionButtonPosition(
      { left: -20, right: 20, top: 4, bottom: 24, width: 40, height: 20 },
      { width: 96, height: 36 },
      { width: 120, height: 80 },
    )).toEqual({ x: 8, y: 32, placement: 'below' });
  });
});
