export interface ShiftRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  pvzId?: string;
  pvzName?: string;
  reason?: string;
}

export interface Correction {
  id: string;
  employeeId: string;
  date: string;
  type: 'fine' | 'bonus';
  amount: number;
  reason: string;
  createdAt: string;
}

export interface Overtime {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  createdAt: string;
}

export interface Invitation {
  id: string;
  phone: string;
  name: string;
  role: 'employee' | 'admin';
  pvzId: string;
  pvzName: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
  invitedBy: string;
}
