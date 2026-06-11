// src/utils/shiftStatusHelper.ts
import { Shift, ShiftStatus, PaymentStatus } from '../types/user';

export type { ShiftStatus, PaymentStatus };

export const getShiftStatus = (
  shift: Pick<Shift, 'date' | 'startTime' | 'endTime' | 'status' | 'paymentStatus'>
): { status: ShiftStatus; paymentStatus: PaymentStatus } => {
  if (shift.paymentStatus === 'paid') {
    return { status: 'paid', paymentStatus: 'paid' };
  }

  if (shift.status === 'completed') {
    return { status: 'completed', paymentStatus: shift.paymentStatus || 'pending' };
  }

  const now = new Date();
  const shiftDate = new Date(shift.date);
  const [startHour, startMinute] = shift.startTime.split(':').map(Number);
  const [endHour, endMinute] = shift.endTime.split(':').map(Number);

  const shiftStartTime = new Date(shiftDate);
  shiftStartTime.setHours(startHour, startMinute, 0, 0);

  const shiftEndTime = new Date(shiftDate);
  shiftEndTime.setHours(endHour, endMinute, 0, 0);
  if (shiftEndTime <= shiftStartTime) {
    shiftEndTime.setDate(shiftEndTime.getDate() + 1);
  }

  if (now < shiftStartTime) {
    return { status: 'planned', paymentStatus: shift.paymentStatus || 'pending' };
  }

  if (now >= shiftStartTime && now <= shiftEndTime) {
    return { status: 'active', paymentStatus: shift.paymentStatus || 'pending' };
  }

  return { status: 'completed', paymentStatus: shift.paymentStatus || 'pending' };
};

/** Смена учитывается в начислениях (завершена или выплачена) */
export const isShiftCountableForAccruals = (
  shift: Pick<Shift, 'date' | 'startTime' | 'endTime' | 'status' | 'paymentStatus'>
): boolean => {
  const { status } = getShiftStatus(shift);
  return status === 'completed' || status === 'paid';
};
