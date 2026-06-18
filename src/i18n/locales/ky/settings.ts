export default {
  title: 'Жөндөөлөр',
  migrated: {
    title: 'Жөндөөлөр көчүрүлдү',
    description: 'Кабарлоолор, тема жана коопсуздук — жалпы жөндөөлөр бөлүмүндө',
  },
  notifications: {
    section: 'Кабарлоолор',
    push: 'PushPush-кабарлоолор',
    sound: 'Кабарлоо үнү',
    vibration: 'Дирилдөө',
    typesSection: 'Кабарлоо түрлөрү',
    types: {
      shift: 'Сменалар',
      schedule: 'График',
      request: 'Арыздар',
      swap: 'Смена алмашуу',
      chat: 'Чат',
      system: 'Системдик',
    },
  },
  security: {
    section: 'Коопсуздук',
    changePin: 'PINPIN-кодду алмаштыруу',
    deleteAccount: 'Аккаунтту өчүрүү',
    deleteAccountDesc: 'Аккаунтту жана бардык байланыштуу маалыматтарды кайтарымсыз өчүрүү',
    biometricLogin: '{{label}}{{label}} аркылуу кирүү',
    biometricHint: 'Тез кирүү үчүн түзмөгүңүздүн коргоосу колдонулат.',
  },
  appearance: {
    section: 'Көрүнүш',
    darkTheme: 'Караңгы тема',
  },
  changePin: {
    title: 'PINPIN-кодду алмаштыруу',
    info: '4 сандан турган PINPIN тиркемеге тез кирүү үчүн колдонулат.',
    current: 'Учурдагы PINPIN',
    new: 'Жаңы PINPIN',
    confirm: 'PINPIN-ди ырастаңыз',
    placeholder: '4 сан',
    mismatch: 'PINPIN-коддор дал келген жок',
  },
} as const;
