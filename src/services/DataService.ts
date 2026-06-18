// src/services/DataService.ts
import { dataEventBus } from './data/dataEventBus';
import * as pvzDataService from './data/pvzDataService';
import * as userDataService from './data/userDataService';
import * as shiftDataService from './data/shiftDataService';
import * as scheduleDataService from './data/scheduleDataService';
import * as shiftRequestDataService from './data/shiftRequestDataService';
import * as swapRequestDataService from './data/swapRequestDataService';
import * as invitationDataService from './data/invitationDataService';
import * as employeeExtrasDataService from './data/employeeExtrasDataService';

class DataService {
  subscribe(key: string, callback: () => void) {
    return dataEventBus.subscribe(key, callback);
  }

  subscribeToPermissions(employeeId: string, callback: () => void) {
    return dataEventBus.subscribeToPermissions(employeeId, callback);
  }

  emitChange(key: string) {
    dataEventBus.emitChange(key);
  }

  getPvzs = pvzDataService.getPvzs;
  getPvzById = pvzDataService.getPvzById;
  getPvzsForAdmin = pvzDataService.getPvzsForAdmin;
  getPvzsByOwner = pvzDataService.getPvzsByOwner;
  savePvz = pvzDataService.savePvz;
  deletePvz = pvzDataService.deletePvz;

  getUsers = userDataService.getUsers;
  getUserById = userDataService.getUserById;
  getEmployees = userDataService.getEmployees;
  saveUser = userDataService.saveUser;
  deleteUser = userDataService.deleteUser;
  permanentlyDeleteUser = userDataService.permanentlyDeleteUser;
  updateUsers = userDataService.updateUsers;
  updateAdminPermissions = userDataService.updateAdminPermissions;
  updateEmployeePermissions = userDataService.updateEmployeePermissions;
  updateEmployeePermissionsWithNotify = userDataService.updateEmployeePermissionsWithNotify;
  getEmployeesWithPermissions = userDataService.getEmployeesWithPermissions;
  hasPermission = userDataService.hasPermission;
  getEmployeePvzs = userDataService.getEmployeePvzs;

  getShifts = shiftDataService.getShifts;
  getShiftsLocal = shiftDataService.getShiftsLocal;
  refreshShiftsCache = shiftDataService.refreshShiftsCache;
  getShiftsByDate = shiftDataService.getShiftsByDate;
  getShiftsByEmployee = shiftDataService.getShiftsByEmployee;
  addShift = shiftDataService.addShift;
  updateShift = shiftDataService.updateShift;
  saveShifts = shiftDataService.saveShifts;
  deleteShift = shiftDataService.deleteShift;
  getShiftsHistory = shiftDataService.getShiftsHistory;
  addShiftHistory = shiftDataService.addShiftHistory;
  updateShiftHistory = shiftDataService.updateShiftHistory;
  getActiveShift = shiftDataService.getActiveShift;
  setActiveShift = shiftDataService.setActiveShift;

  getScheduleAssignments = scheduleDataService.getScheduleAssignments;
  saveScheduleAssignments = scheduleDataService.saveScheduleAssignments;
  upsertScheduleAssignment = scheduleDataService.upsertScheduleAssignment;
  syncScheduleFromShifts = scheduleDataService.syncScheduleFromShifts;
  approveShiftRequest = scheduleDataService.approveShiftRequest;

  getAllShiftRequests = shiftRequestDataService.getAllShiftRequests;
  getShiftRequestsByEmployee = shiftRequestDataService.getShiftRequestsByEmployee;
  addShiftRequest = shiftRequestDataService.addShiftRequest;
  updateShiftRequest = shiftRequestDataService.updateShiftRequest;
  refreshShiftRequestsCache = shiftRequestDataService.refreshShiftRequestsCache;
  getShiftRequestNotifyRecipients = shiftRequestDataService.getShiftRequestNotifyRecipients;

  getSwapRequestsByPvz = swapRequestDataService.getSwapRequestsByPvz;
  countPendingSwapRequests = swapRequestDataService.countPendingSwapRequests;
  loadSwapRequestsForUser = swapRequestDataService.loadSwapRequestsForUser;
  addSwapRequest = swapRequestDataService.addSwapRequest;
  approveSwapRequest = swapRequestDataService.approveSwapRequest;
  rejectSwapRequest = swapRequestDataService.rejectSwapRequest;
  cancelSwapRequest = swapRequestDataService.cancelSwapRequest;

  getInvitations = invitationDataService.getInvitations;
  addInvitation = invitationDataService.addInvitation;
  updateInvitation = invitationDataService.updateInvitation;
  deleteInvitation = invitationDataService.deleteInvitation;
  resendInvitation = invitationDataService.resendInvitation;
  refreshInvitationsForLogin = invitationDataService.refreshInvitationsForLogin;
  getPendingInvitationsForLoginPhone = invitationDataService.getPendingInvitationsForLoginPhone;
  refreshInvitationsCache = invitationDataService.refreshInvitationsCache;

  getCorrections = employeeExtrasDataService.getCorrections;
  addCorrection = employeeExtrasDataService.addCorrection;
  getOvertimes = employeeExtrasDataService.getOvertimes;
  addOvertime = employeeExtrasDataService.addOvertime;
  updateOvertime = employeeExtrasDataService.updateOvertime;
  calculateEmployeeStats = employeeExtrasDataService.calculateEmployeeStats;
  getItemAsync = employeeExtrasDataService.getItemAsync;
  setItemAsync = employeeExtrasDataService.setItemAsync;
  clearAllData = employeeExtrasDataService.clearAllData;
}

export default new DataService();
