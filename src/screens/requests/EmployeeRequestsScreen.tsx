// src/screens/requests/EmployeeRequestsScreen.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import DataService from '../../services/DataService';
import notificationService from '../../services/NotificationService';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import UnifiedCalendar from '../../components/common/UnifiedCalendar';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import PermissionGate from '../../components/common/PermissionGate';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import {
  Calendar as CalendarIcon,
  Clock,
  X,
  CheckCircle,
  Clock as ClockIcon,
  Send,
  ChevronLeft,
  Plus,
} from 'lucide-react-native';
import { formatDate, toDateKey } from '../../utils/dateHelpers';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';
import { generateSecureId } from '../../utils/generateSecureId';
import {
  getShiftPresetsForPvz,
  DEFAULT_SHIFT_PRESETS,
  ShiftPreset,
  ShiftPresetId,
} from '../../utils/shiftPresets';

interface ShiftRequest {
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

const validateTime = (time: string): boolean => {
  if (!time || time.length !== 5 || time[2] !== ':') return false;
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
};

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export default function EmployeeRequestsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { screen, ui } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('22:00');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [shiftsByDate, setShiftsByDate] = useState<{ [key: string]: any[] }>({});
  const [shiftPresets, setShiftPresets] = useState<ShiftPreset[]>(DEFAULT_SHIFT_PRESETS);
  const [selectedPresetId, setSelectedPresetId] = useState<ShiftPresetId | null>('full');

  useEffect(() => {
    getShiftPresetsForPvz(pvz?.id).then((presets) => {
      setShiftPresets(presets);
      const full = presets.find((p) => p.id === 'full') || presets[0];
      if (full) {
        setStartTime(full.startTime);
        setEndTime(full.endTime);
        setSelectedPresetId(full.id);
      }
    });
  }, [pvz?.id]);

  const loadRequests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const all = await DataService.getAllShiftRequests();
      const mine = all
        .filter((r) => r.employeeId === user.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(mine);
    } catch (error) {
      console.error('Ошибка загрузки заявок:', error);
    }
  }, [user?.id]);

  const loadShiftsForCalendar = useCallback(async () => {
    try {
      const shifts = await DataService.getShifts();
      const filtered = shifts.filter(
        (s) => !pvz?.id || !s.pvzId || s.pvzId === pvz.id
      );
      const grouped: { [key: string]: any[] } = {};
      filtered.forEach((shift) => {
        if (!grouped[shift.date]) grouped[shift.date] = [];
        grouped[shift.date].push({
          id: shift.id,
          employeeId: shift.employeeId,
          employeeName: shift.employeeName,
          startTime: shift.startTime,
          endTime: shift.endTime,
          date: shift.date,
        });
      });
      setShiftsByDate(grouped);
    } catch (error) {
      console.error('Ошибка загрузки расписания:', error);
    }
  }, [pvz?.id]);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
      loadShiftsForCalendar();
      const unsubAll = DataService.subscribe('all_shift_requests', loadRequests);
      const unsubMine = user?.id
        ? DataService.subscribe(`shift_requests_${user.id}`, loadRequests)
        : () => {};
      return () => {
        unsubAll();
        unsubMine();
      };
    }, [loadRequests, loadShiftsForCalendar])
  );

  const applyPreset = (preset: ShiftPreset) => {
    setSelectedPresetId(preset.id);
    setStartTime(preset.startTime);
    setEndTime(preset.endTime);
  };

  const openNewRequest = () => {
    setSelectedDate('');
    const full = shiftPresets.find((p) => p.id === 'full') || shiftPresets[0];
    setStartTime(full?.startTime || '10:00');
    setEndTime(full?.endTime || '22:00');
    setSelectedPresetId(full?.id || 'full');
    setReason('');
    setShowCalendar(true);
  };

  const handleDateSelected = (date: string) => {
    setSelectedDate(date);
    setShowCalendar(false);
    setModalVisible(true);
  };

  const saveRequest = async () => {
    if (!selectedDate) {
      showError(t('alerts.validation.selectDate'));
      return;
    }
    if (selectedDate < toDateKey(new Date())) {
      showError(t('alerts.validation.pastDate'));
      return;
    }
    if (!validateTime(startTime) || !validateTime(endTime)) {
      showError(t('alerts.validation.timeFormat'));
      return;
    }
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      showError(t('alerts.validation.endAfterStart'));
      return;
    }

    const duplicate = requests.find(
      (r) => r.date === selectedDate && r.status === 'pending'
    );
    if (duplicate) {
      showError(t('alerts.validation.duplicateRequest'));
      return;
    }

    setLoading(true);
    try {
      const newRequest: ShiftRequest = {
        id: generateSecureId(),
        employeeId: user?.id || '',
        employeeName: user?.name || t('common.roles.employee'),
        date: selectedDate,
        startTime,
        endTime,
        status: 'pending',
        createdAt: new Date().toISOString(),
        pvzId: pvz?.id,
        pvzName: pvz?.name,
        reason: reason.trim() || undefined,
      };

      await DataService.addShiftRequest(newRequest);
      await loadRequests();

      await notificationService.notifyStaffNewShiftRequest({
        pvzId: pvz?.id,
        pvzName: pvz?.name,
        employeeId: user?.id || '',
        employeeName: user?.name || t('common.roles.employee'),
        date: selectedDate,
        startTime,
        endTime,
        requestId: newRequest.id,
      });

      await notificationService.sendLocalNotification(
        t('screens.requests.requestSent'),
        t('screens.requests.requestSentPending', { date: formatDate(selectedDate, 'dayMonth') }),
        { type: 'shift_request_sent' },
        { saveToHistory: true, notificationType: 'request' }
      );

      showSuccess(t('screens.requests.requestSentDone'));
      closeModal();
    } catch {
      showError(t('alerts.network.submitRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedDate('');
    const full = shiftPresets.find((p) => p.id === 'full') || shiftPresets[0];
    setStartTime(full?.startTime || '10:00');
    setEndTime(full?.endTime || '22:00');
    setSelectedPresetId(full?.id || 'full');
    setReason('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return colors.success;
      case 'rejected':
        return colors.danger;
      default:
        return colors.warning;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return t('screens.requests.statusApproved');
      case 'rejected':
        return t('screens.requests.statusRejected');
      default:
        return t('screens.requests.statusPending');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={14} color={colors.success} />;
      case 'rejected':
        return <X size={14} color={colors.danger} />;
      default:
        return <ClockIcon size={14} color={colors.warning} />;
    }
  };

  const formatCreatedAt = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadRequests(), loadShiftsForCalendar()]);
    setRefreshing(false);
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const listHeader = (
    <>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, ui.card]}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={[styles.statLabel, ui.subtitle]}>{t('common.filters.pending')}</Text>
        </View>
        <View style={[styles.statCard, ui.card]}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {requests.filter((r) => r.status === 'approved').length}
          </Text>
          <Text style={[styles.statLabel, ui.subtitle]}>{t('common.status.approved')}</Text>
        </View>
        <View style={[styles.statCard, ui.card]}>
          <Text style={[styles.statValue, { color: colors.danger }]}>
            {requests.filter((r) => r.status === 'rejected').length}
          </Text>
          <Text style={[styles.statLabel, ui.subtitle]}>{t('common.status.rejected')}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.createButton} onPress={openNewRequest}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          style={styles.createButtonGradient}
        >
          <CalendarIcon size={20} color="#FFFFFF" />
          <Text style={styles.createButtonText}>{t('screens.requests.newRequest')}</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, ui.sectionTitle]}>{t('screens.requests.myRequests')}</Text>
    </>
  );

  const renderRequestItem = useCallback(
    ({ item: request }: { item: (typeof requests)[number] }) => (
      <View style={[styles.requestCard, ui.card]}>
        <View style={styles.requestHeader}>
          <View style={styles.requestStatus}>
            {getStatusIcon(request.status)}
            <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>
              {getStatusText(request.status)}
            </Text>
          </View>
          <Text style={[styles.requestDate, ui.title]}>{formatDate(request.date, 'dayMonth')}</Text>
        </View>

        <View style={styles.requestTime}>
          <Clock size={14} color={colors.gray} />
          <Text style={[styles.requestTimeText, ui.title]}>
            {request.startTime} — {request.endTime}
          </Text>
        </View>

        {request.reason ? (
          <Text style={[styles.requestReason, ui.subtitle]} numberOfLines={2}>
            {request.reason}
          </Text>
        ) : null}

        <Text style={[styles.requestCreated, ui.subtitle]}>
          {t('screens.requests.submittedAt', { date: formatCreatedAt(request.createdAt) })}
        </Text>
      </View>
    ),
    [ui, t, getStatusIcon, getStatusColor, getStatusText, formatCreatedAt]
  );

  return (
    <PermissionGate permission="canRequestShifts" navigation={navigation}>
      <ThemedSafeAreaView>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSide}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('screens.requests.title')}</Text>
            {pvz?.name ? <Text style={styles.headerSubtitle}>{pvz.name}</Text> : null}
          </View>
          <TouchableOpacity onPress={openNewRequest} style={styles.headerSide}>
            <Plus size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </LinearGradient>

        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequestItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Send size={48} color={colors.grayLighter} />
              <Text style={[styles.emptyText, ui.subtitle]}>{t('screens.requests.empty')}</Text>
              <Text style={[styles.emptySubtext, ui.subtitle]}>{t('screens.requests.emptyHint')}</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          {...FLAT_LIST_PERF}
        />

        <UnifiedCalendar
          visible={showCalendar}
          onClose={() => setShowCalendar(false)}
          onSelectDate={handleDateSelected}
          selectedDate={selectedDate}
          shiftsByDate={shiftsByDate}
          disablePastDates
          title={t('screens.requests.shiftDate')}
        />

        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeModal}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoidingView}
              >
                <View style={[styles.modalContent, ui.modal]}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, ui.title]}>{t('screens.requests.modalTitle')}</Text>
                    <TouchableOpacity onPress={closeModal}>
                      <X size={24} color={colors.gray} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={[styles.inputLabel, ui.sectionTitle]}>{t('screens.requests.date')}</Text>
                    <TouchableOpacity
                      style={[styles.dateDisplay, { backgroundColor: ui.input.backgroundColor }]}
                      onPress={() => {
                        setModalVisible(false);
                        setShowCalendar(true);
                      }}
                    >
                      <CalendarIcon size={20} color={colors.primary} />
                      <Text style={[styles.dateDisplayText, ui.title]}>
                        {selectedDate ? formatDate(selectedDate, 'long') : t('screens.requests.dateNotSelected')}
                      </Text>
                    </TouchableOpacity>

                    <Text style={[styles.inputLabel, ui.sectionTitle]}>{t('screens.requests.shiftType')}</Text>
                    <View style={styles.presetRow}>
                      {shiftPresets.map((preset) => {
                        const active = selectedPresetId === preset.id;
                        return (
                          <TouchableOpacity
                            key={preset.id}
                            style={[
                              styles.presetChip,
                              { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
                              active && styles.presetChipActive,
                            ]}
                            onPress={() => applyPreset(preset)}
                          >
                            <Text
                              style={[styles.presetChipLabel, ui.title, active && styles.presetChipLabelActive]}
                            >
                              {preset.label}
                            </Text>
                            <Text
                              style={[styles.presetChipTime, ui.subtitle, active && styles.presetChipLabelActive]}
                            >
                              {preset.timeLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={styles.timeRow}>
                      <View style={styles.timeField}>
                        <Text style={[styles.inputLabel, ui.sectionTitle]}>{t('screens.requests.start')}</Text>
                        <TextInput
                          style={[styles.timeInput, ui.input]}
                          value={startTime}
                          onChangeText={(v) => {
                            setStartTime(v);
                            setSelectedPresetId(null);
                          }}
                          placeholder="10:00"
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                        />
                      </View>
                      <View style={styles.timeField}>
                        <Text style={[styles.inputLabel, ui.sectionTitle]}>{t('screens.requests.end')}</Text>
                        <TextInput
                          style={[styles.timeInput, ui.input]}
                          value={endTime}
                          onChangeText={(v) => {
                            setEndTime(v);
                            setSelectedPresetId(null);
                          }}
                          placeholder="22:00"
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                        />
                      </View>
                    </View>

                    <Text style={[styles.inputLabel, ui.sectionTitle]}>{t('common.form.commentOptional')}</Text>
                    <TextInput
                      style={[styles.reasonInput, ui.input]}
                      placeholder={t('screens.requests.commentPlaceholder')}
                      value={reason}
                      onChangeText={setReason}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      placeholderTextColor={colors.grayLighter}
                    />

                    <TouchableOpacity
                      style={[styles.submitButton, loading && styles.disabledButton]}
                      onPress={saveRequest}
                      disabled={loading}
                    >
                      <LinearGradient
                        colors={[colors.primary, colors.primaryDark]}
                        style={styles.submitGradient}
                      >
                        <Send size={18} color="#FFFFFF" />
                        <Text style={styles.submitText}>
                          {loading ? t('common.loading.sending') : t('screens.requests.submit')}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </ThemedSafeAreaView>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 12,
  },
  headerSide: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  scrollContent: { padding: 16, paddingBottom: 40 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.primary },
  statLabel: { fontSize: 11, marginTop: 2 },

  createButton: { marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  createButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },

  emptyContainer: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, marginTop: 16 },
  emptySubtext: { fontSize: 13, marginTop: 6, textAlign: 'center' },

  requestCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  requestStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  requestDate: { fontSize: 15, fontWeight: '600' },
  requestTime: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requestTimeText: { fontSize: 14 },
  requestReason: { fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  requestCreated: { fontSize: 11, marginTop: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  keyboardAvoidingView: { width: '100%' },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  inputLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8, marginTop: 12 },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateDisplayText: { fontSize: 15, flex: 1 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  presetChip: {
    flex: 1,
    minWidth: '30%',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  presetChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  presetChipLabel: { fontSize: 13, fontWeight: '600' },
  presetChipTime: { fontSize: 11, marginTop: 2 },
  presetChipLabelActive: { color: colors.primary },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1 },
  timeInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  reasonInput: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: { marginTop: 20, marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  submitText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  disabledButton: { opacity: 0.6 },
});
