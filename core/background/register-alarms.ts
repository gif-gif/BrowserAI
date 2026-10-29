import type { AlarmsApi } from './browser-api';

export const DAILY_CLEANUP_ALARM = 'chrome-ai-daily-cleanup';
const DAY_IN_MINUTES = 24 * 60;

export function registerAlarms(
  alarms: AlarmsApi,
  cleanup: () => Promise<void> = async () => undefined,
): { ready: Promise<void>; dispose(): void } {
  const ready = alarms.get(DAILY_CLEANUP_ALARM).then(async (existing) => {
    if (!existing) await alarms.create(DAILY_CLEANUP_ALARM, { periodInMinutes: DAY_IN_MINUTES });
  });
  const onAlarm = (alarm: { name: string }) => {
    if (alarm.name === DAILY_CLEANUP_ALARM) void cleanup();
  };
  alarms.onAlarm.addListener(onAlarm);
  return {
    ready,
    dispose() { alarms.onAlarm.removeListener(onAlarm); },
  };
}
