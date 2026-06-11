// src/services/SmsService.ts
import * as SecureStore from 'expo-secure-store';

class SmsService {
  // Очистка ключа от недопустимых символов
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9:_-]/g, '_');
  }

  // Генерация 4-значного кода
  generateCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }
  
  // Отправка SMS (заглушка - в реальном приложении здесь был бы API)
  async sendSms(phone: string, code: string): Promise<boolean> {
    console.log(`📱 SMS на ${phone}: Ваш код подтверждения: ${code}`);
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const sanitizedKey = this.sanitizeKey(`sms_code_${cleanPhone}`);
    const expiryKey = this.sanitizeKey(`sms_code_expiry_${cleanPhone}`);
    
    // Сохраняем код в хранилище для проверки
    await SecureStore.setItemAsync(sanitizedKey, code);
    await SecureStore.setItemAsync(expiryKey, Date.now().toString());
    
    return true;
  }
  
  // Проверка кода
  async verifyCode(phone: string, code: string): Promise<boolean> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const sanitizedKey = this.sanitizeKey(`sms_code_${cleanPhone}`);
    const expiryKey = this.sanitizeKey(`sms_code_expiry_${cleanPhone}`);
    
    const savedCode = await SecureStore.getItemAsync(sanitizedKey);
    const expiryStr = await SecureStore.getItemAsync(expiryKey);
    const expiry = expiryStr ? parseInt(expiryStr) : 0;
    
    // Код действителен 5 минут
    if (Date.now() - expiry > 5 * 60 * 1000) {
      return false;
    }
    
    return savedCode === code;
  }
  
  // Удаление кода после успешной проверки
  async clearCode(phone: string): Promise<void> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const sanitizedKey = this.sanitizeKey(`sms_code_${cleanPhone}`);
    const expiryKey = this.sanitizeKey(`sms_code_expiry_${cleanPhone}`);
    
    await SecureStore.deleteItemAsync(sanitizedKey);
    await SecureStore.deleteItemAsync(expiryKey);
  }
}

export default new SmsService();