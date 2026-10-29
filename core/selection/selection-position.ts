export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface SelectionButtonPosition {
  x: number;
  y: number;
  placement: 'above' | 'below';
}

const VIEWPORT_MARGIN = 8;
const SELECTION_GAP = 8;

export function calculateSelectionButtonPosition(
  selection: RectLike,
  button: Size,
  viewport: Size,
): SelectionButtonPosition {
  const placement = selection.top - SELECTION_GAP - button.height >= VIEWPORT_MARGIN ? 'above' : 'below';
  const desiredY = placement === 'above'
    ? selection.top - SELECTION_GAP - button.height
    : selection.bottom + SELECTION_GAP;
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - button.width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - button.height - VIEWPORT_MARGIN);

  return {
    x: Math.min(maxX, Math.max(VIEWPORT_MARGIN, selection.left + (selection.width - button.width) / 2)),
    y: Math.min(maxY, Math.max(VIEWPORT_MARGIN, desiredY)),
    placement,
  };
}
