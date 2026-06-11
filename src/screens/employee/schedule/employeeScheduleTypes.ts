export interface EmployeeShift {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftType?: string;
  status: string;
}

export type ViewMode = 'mine' | 'team';
export type CalendarView = 'week' | 'month';
