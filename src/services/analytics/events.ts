/** Имена событий аналитики — единый справочник для SQL-запросов. */
export const AnalyticsEvents = {
  APP_OPEN: 'app_open',
  SCREEN_VIEW: 'screen_view',
  SIGN_IN: 'sign_in',
  SIGN_OUT: 'sign_out',
  PVZ_CREATED: 'pvz_created',
  PVZ_UPDATED: 'pvz_updated',
  EMPLOYEE_INVITED: 'employee_invited',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  SUBSCRIPTION_VIEWED: 'subscription_viewed',
  SHIFT_REQUEST_SUBMITTED: 'shift_request_submitted',
  ADVANCE_REQUEST_SUBMITTED: 'advance_request_submitted',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
