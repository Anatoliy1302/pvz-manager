export default {
  title: 'Настройки',
  migrated: {
    title: 'Настройки перенесены',
    description: 'Уведомления, тема и безопасность — в общем разделе настроек',
  },
  notifications: {
    section: 'Уведомления',
    push: 'Push-уведомления',
    sound: 'Звук уведомлений',
    vibration: 'Вибрация',
  },
  security: {
    section: 'Безопасность',
    changePin: 'Сменить PIN-код',
    biometricLogin: 'Вход через {{label}}',
    biometricHint: 'Для быстрого входа используется защита вашего устройства.',
  },
  appearance: {
    section: 'Внешний вид',
    darkTheme: 'Тёмная тема',
  },
  changePin: {
    title: 'Сменить PIN-код',
    info: 'PIN из 4 цифр используется для быстрого входа в приложение.',
    current: 'Текущий PIN',
    new: 'Новый PIN',
    confirm: 'Подтвердите PIN',
    placeholder: '4 цифры',
    mismatch: 'PIN-коды не совпадают',
  },
} as const;
