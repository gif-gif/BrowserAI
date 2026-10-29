export type ScreenshotCaptureMode = 'region';

export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export type ScreenshotSelectionResult =
  | { cancelled: true }
  | { cancelled: false; region: ScreenshotRegion };

export interface ScreenshotSelectionLabels {
  instruction: string;
  cancelHint: string;
}
