// src/utils/migrationHelpers.ts
import * as SecureStore from 'expo-secure-store';
import { calcPvzTotalHours } from './salaryRateHelpers';

/**
 * Миграция глобальных настроек зарплаты для ПВЗ
 * Добавляет поля rateType и rateValue для совместимости с EmployeeTimesheetScreen
 */
export async function migrateGlobalSalarySettings(pvzId: string): Promise<void> {
  try {
    const key = `global_salary_settings_${pvzId}`;
    const stored = await SecureStore.getItemAsync(key);
    
    if (stored) {
      const settings = JSON.parse(stored);
      let needsUpdate = false;
      
      // Добавляем rateType, если отсутствует
      if (settings.rateType === undefined) {
        settings.rateType = 'shift';
        needsUpdate = true;
      }
      
      // Добавляем rateValue, если отсутствует
      if (settings.rateValue === undefined) {
        settings.rateValue = settings.fullShiftRate || 3000;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await SecureStore.setItemAsync(key, JSON.stringify(settings));
        console.log(`✅ Миграция настроек для ПВЗ ${pvzId} завершена`);
      }
    }
  } catch (error) {
    console.error(`Ошибка миграции настроек для ПВЗ ${pvzId}:`, error);
  }
}

/**
 * Миграция всех ПВЗ пользователя
 */
export async function migrateAllPvzSettings(ownerId: string): Promise<void> {
  try {
    const pvzsRaw = await SecureStore.getItemAsync('pvz_list');
    if (!pvzsRaw) return;
    
    const pvzs = JSON.parse(pvzsRaw);
    const ownerPvzs = pvzs.filter((p: any) => p.ownerId === ownerId);
    
    for (const pvz of ownerPvzs) {
      await migrateGlobalSalarySettings(pvz.id);
    }
    
    console.log(`✅ Миграция настроек для ${ownerPvzs.length} ПВЗ завершена`);
  } catch (error) {
    console.error('Ошибка миграции настроек ПВЗ:', error);
  }
}

/**
 * Миграция индивидуальных настроек сотрудников
 * Добавляет полную структуру ставок для совместимости
 */
export async function migrateEmployeeSalarySettings(pvzId: string): Promise<void> {
  try {
    const key = `salary_settings_${pvzId}`;
    const stored = await SecureStore.getItemAsync(key);
    
    if (stored) {
      const settings = JSON.parse(stored);
      let needsUpdate = false;
      
      // Обходим всех сотрудников в настройках
      for (const employeeId in settings) {
        const empSettings = settings[employeeId];
        
        // Добавляем fullShiftRate, если есть только rateValue
        if (empSettings.fullShiftRate === undefined && empSettings.rateValue) {
          empSettings.fullShiftRate = empSettings.rateValue;
          needsUpdate = true;
        }
        
        // Добавляем halfShiftRate
        if (empSettings.halfShiftRate === undefined && empSettings.fullShiftRate) {
          empSettings.halfShiftRate = empSettings.fullShiftRate / 2;
          needsUpdate = true;
        }
        
        // Добавляем hourlyRate
        if (empSettings.hourlyRate === undefined && empSettings.fullShiftRate) {
          // Получаем часы работы ПВЗ (по умолчанию 12)
          const pvzRaw = await SecureStore.getItemAsync('pvz_list');
          let totalHours = 12;
          if (pvzRaw) {
            const pvzs = JSON.parse(pvzRaw);
            const currentPvz = pvzs.find((p: any) => p.id === pvzId);
            if (currentPvz) {
              totalHours = calcPvzTotalHours(
                currentPvz.workStart || '09:00',
                currentPvz.workEnd || '21:00'
              );
            }
          }
          empSettings.hourlyRate = empSettings.fullShiftRate / totalHours;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        await SecureStore.setItemAsync(key, JSON.stringify(settings));
        console.log(`✅ Миграция настроек сотрудников для ПВЗ ${pvzId} завершена`);
      }
    }
  } catch (error) {
    console.error(`Ошибка миграции настроек сотрудников для ПВЗ ${pvzId}:`, error);
  }
}

/**
 * Полная миграция всех данных приложения
 * Вызывается при первом запуске после обновления
 */
export async function runFullMigration(userId: string, pvzId?: string): Promise<void> {
  console.log('🚀 Запуск полной миграции данных...');
  
  try {
    // Миграция глобальных настроек
    if (pvzId) {
      await migrateGlobalSalarySettings(pvzId);
      await migrateEmployeeSalarySettings(pvzId);
    }
    
    console.log('✅ Полная миграция данных завершена');
  } catch (error) {
    console.error('❌ Ошибка при миграции данных:', error);
  }
}