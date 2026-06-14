export default {
  title: 'Sozlamalar',
  migrated: {
    title: 'Sozlamalar ko\'chirildi',
    description: 'Bildirishnomalar, mavzu va xavfsizlik — umumiy sozlamalar bo\'limida',
  },
  notifications: {
    section: 'Bildirishnomalar',
    push: 'Push-bildirishnomalar',
    sound: 'Bildirishnoma ovozi',
    vibration: 'Tebranish',
    typesSection: 'Bildirishnoma turlari',
    types: {
      shift: 'Smenalar',
      schedule: 'Jadval',
      request: 'Arizalar',
      swap: 'Smena almashinuvi',
      chat: 'Chat',
      system: 'Tizim',
    },
  },
  security: {
    section: 'Xavfsizlik',
    changePin: 'PIN-kodni almashtirish',
    biometricLogin: '{{label}} orqali kirish',
    biometricHint: 'Tez kirish uchun qurilmangiz himoyasi ishlatiladi.',
  },
  appearance: {
    section: 'Ko\'rinish',
    darkTheme: 'Qorong\'u mavzu',
  },
  changePin: {
    title: 'PIN-kodni almashtirish',
    info: '4 raqamli PIN ilovaga tez kirish uchun ishlatiladi.',
    current: 'Joriy PIN',
    new: 'Yangi PIN',
    confirm: 'PIN ni tasdiqlang',
    placeholder: '4 raqam',
    mismatch: 'PIN-kodlar mos kelmaydi',
  },
} as const;
