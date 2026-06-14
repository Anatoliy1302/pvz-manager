import { t, getDateLocale } from '../../i18n';
import { formatDate } from '../../utils/dateHelpers';

export function formatNotificationDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString(getDateLocale());
  } catch {
    return date;
  }
}

export function pvzSuffix(pvzName?: string): string {
  return pvzName ? ` · ${pvzName}` : '';
}

export function shiftAddedTexts(
  employeeName: string,
  date: string,
  time: string,
  pvzName?: string
) {
  return {
    title: t('notifications.shift.addedTitle'),
    message: t('notifications.shift.addedBody', {
      name: employeeName,
      date: formatNotificationDate(date),
      time,
      pvz: pvzName || '',
    }),
  };
}

export function shiftUpdatedTexts(
  employeeName: string,
  date: string,
  oldTime: string,
  newTime: string,
  pvzName?: string
) {
  return {
    title: t('notifications.shift.updatedTitle'),
    message: t('notifications.shift.updatedBody', {
      name: employeeName,
      date: formatNotificationDate(date),
      oldTime,
      newTime,
      pvz: pvzName || '',
    }),
  };
}

export function shiftDeletedTexts(
  employeeName: string,
  date: string,
  time: string,
  pvzName?: string
) {
  return {
    title: t('notifications.shift.deletedTitle'),
    message: t('notifications.shift.deletedBody', {
      name: employeeName,
      date: formatNotificationDate(date),
      time,
      pvz: pvzName || '',
    }),
  };
}

export function scheduleCopiedTexts(pvzName: string, fromDate: string, toDate: string) {
  return {
    title: t('notifications.schedule.copiedTitle'),
    message: t('notifications.schedule.copiedBody', { pvz: pvzName, fromDate, toDate }),
  };
}

export function scheduleChangedTexts(
  pvzName: string,
  affectedCount: number,
  changeType: string
) {
  return {
    title: t('notifications.schedule.changedTitle'),
    message: t('notifications.schedule.changedBody', {
      pvz: pvzName,
      changeType,
      count: affectedCount,
    }),
  };
}

export function shiftStartedTexts(employeeName: string, pvzName: string) {
  return {
    title: t('notifications.shift.startedTitle'),
    message: t('notifications.shift.startedBody', { name: employeeName, pvz: pvzName }),
  };
}

export function shiftEndedTexts(
  employeeName: string,
  duration: string,
  earnings: number,
  rateInfo?: string
) {
  return {
    title: t('notifications.shift.endedTitle'),
    message: t('notifications.shift.endedBody', {
      name: employeeName,
      duration,
      earnings,
      rateInfo: rateInfo ? ` (${rateInfo})` : '',
    }),
  };
}

export function shiftAutoEndedTexts(employeeName: string, reason: string) {
  return {
    title: t('notifications.shift.autoEndedTitle'),
    message: t('notifications.shift.autoEndedBody', { name: employeeName, reason }),
  };
}

export function locationWarningTexts(employeeName: string) {
  return {
    title: t('notifications.system.locationTitle'),
    message: t('notifications.system.locationBody', { name: employeeName }),
  };
}

export function requestStatusTexts(requestType: string, status: 'approved' | 'rejected') {
  const statusText = t(`notifications.status.${status}`);
  return {
    title: t(
      status === 'approved'
        ? 'notifications.request.approvedTitle'
        : 'notifications.request.rejectedTitle'
    ),
    message: t('notifications.request.statusBody', { requestType, status: statusText }),
  };
}

export function shiftRequestDecisionTexts(
  date: string,
  status: 'approved' | 'rejected',
  pvzName?: string
) {
  const dateLabel = formatDate(date, 'dayMonth');
  return {
    title: t(
      status === 'approved'
        ? 'notifications.request.approvedTitle'
        : 'notifications.request.rejectedTitle'
    ),
    message:
      status === 'approved'
        ? t('notifications.request.shiftApprovedBody', {
            date: dateLabel,
            pvzSuffix: pvzSuffix(pvzName),
          })
        : t('notifications.request.shiftRejectedBody', { date: dateLabel }),
  };
}

export function newShiftRequestStaffTexts(
  employeeName: string,
  date: string,
  startTime: string,
  endTime: string,
  pvzName?: string
) {
  return {
    title: t('notifications.request.newShiftTitle'),
    message: t('notifications.request.newShiftBody', {
      employeeName,
      date: formatDate(date, 'dayMonth'),
      time: `${startTime}–${endTime}`,
      pvzSuffix: pvzSuffix(pvzName),
    }),
  };
}

export function newShiftRequestAdminTexts(
  adminName: string,
  employeeName: string,
  date: string
) {
  return {
    title: t('notifications.request.newShiftTitle'),
    message: t('notifications.request.newShiftAdminBody', {
      adminName,
      employeeName,
      date: formatDate(date, 'dayMonth'),
    }),
  };
}

export function newSwapRequestTexts(
  fromName: string,
  toName: string,
  fromDate: string,
  toDate: string,
  pvzName?: string
) {
  return {
    title: t('notifications.swap.newTitle'),
    message: t('notifications.swap.newBody', {
      fromName,
      toName,
      fromDate: formatDate(fromDate, 'dayMonth'),
      toDate: formatDate(toDate, 'dayMonth'),
      pvzSuffix: pvzSuffix(pvzName),
    }),
  };
}

export function swapSubmittedTexts(toName: string, fromDate: string, toDate: string) {
  return {
    title: t('notifications.swap.submittedTitle'),
    message: t('notifications.swap.submittedBody', {
      toName,
      fromDate: formatDate(fromDate, 'dayMonth'),
      toDate: formatDate(toDate, 'dayMonth'),
    }),
  };
}

export function swapApprovedAdminTexts(
  fromName: string,
  toName: string,
  date: string
) {
  return {
    title: t('notifications.swap.approvedTitle'),
    message: t('notifications.swap.approvedBody', {
      fromName,
      toName,
      date: formatDate(date, 'dayMonth'),
    }),
  };
}

export function swapRejectedAdminTexts(fromName: string, toName: string) {
  return {
    title: t('notifications.swap.rejectedTitle'),
    message: t('notifications.swap.rejectedBody', { fromName, toName }),
  };
}

export function swapOfferTexts(fromName: string, toName: string, date: string) {
  return {
    title: t('notifications.swap.offerTitle'),
    message: t('notifications.swap.offerBody', {
      fromName,
      toName,
      date: formatNotificationDate(date),
    }),
  };
}

export function swapApprovedPeerTexts(fromName: string, toName: string, date: string) {
  return {
    title: t('notifications.swap.approvedTitle'),
    message: t('notifications.swap.approvedPeerBody', {
      fromName,
      toName,
      date: formatNotificationDate(date),
    }),
  };
}

export function swapRejectedPeerTexts(fromName: string, toName: string) {
  return {
    title: t('notifications.swap.rejectedTitle'),
    message: t('notifications.swap.rejectedPeerBody', { fromName, toName }),
  };
}

export function advanceRequestTexts(
  employeeName: string,
  amount: number,
  pvzName?: string
) {
  return {
    title: t('notifications.request.advanceTitle'),
    message: t('notifications.request.advanceBody', {
      employeeName,
      amount: amount.toLocaleString(getDateLocale()),
      pvzSuffix: pvzSuffix(pvzName),
    }),
  };
}

export function chatMessageTexts(senderName: string, text: string) {
  const body = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  return {
    title: t('notifications.system.chatTitle', { senderName }),
    body,
  };
}
