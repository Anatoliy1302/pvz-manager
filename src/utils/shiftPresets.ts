import { getPvzWorkHours } from './salaryRateHelpers';

export type ShiftPresetId = 'full' | 'morning' | 'evening';

export interface ShiftPreset {
  id: ShiftPresetId;
  label: string;
  timeLabel: string;
  startTime: string;
  endTime: string;
}

const addHoursToTime = (time: string, hours: number): string => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + Math.round(hours * 60);
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
};

const subtractHoursFromTime = (time: string, hours: number): string => {
  const [h, m] = time.split(':').map(Number);
  let total = h * 60 + m - Math.round(hours * 60);
  if (total < 0) total = 0;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
};

export const DEFAULT_SHIFT_PRESETS: ShiftPreset[] = [
  { id: 'full', label: 'Полная', timeLabel: '10:00–22:00', startTime: '10:00', endTime: '22:00' },
  { id: 'morning', label: 'Утро', timeLabel: '10:00–16:00', startTime: '10:00', endTime: '16:00' },
  { id: 'evening', label: 'Вечер', timeLabel: '16:00–22:00', startTime: '16:00', endTime: '22:00' },
];

export async function getShiftPresetsForPvz(pvzId?: string): Promise<ShiftPreset[]> {
  if (!pvzId) return DEFAULT_SHIFT_PRESETS;

  try {
    const { workStart, workEnd, totalHours } = await getPvzWorkHours(pvzId);
    const halfHours = totalHours / 2;
    const morningEnd = addHoursToTime(workStart, halfHours);
    const eveningStart = subtractHoursFromTime(workEnd, halfHours);

    return [
      {
        id: 'full',
        label: 'Полная',
        timeLabel: `${workStart}–${workEnd}`,
        startTime: workStart,
        endTime: workEnd,
      },
      {
        id: 'morning',
        label: 'Утро',
        timeLabel: `${workStart}–${morningEnd}`,
        startTime: workStart,
        endTime: morningEnd,
      },
      {
        id: 'evening',
        label: 'Вечер',
        timeLabel: `${eveningStart}–${workEnd}`,
        startTime: eveningStart,
        endTime: workEnd,
      },
    ];
  } catch {
    return DEFAULT_SHIFT_PRESETS;
  }
}
