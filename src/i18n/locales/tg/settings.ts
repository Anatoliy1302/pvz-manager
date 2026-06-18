export default {
  title: 'Танзимот',
  migrated: {
    title: 'Танзимот кӯчонида шуд',
    description: 'Огоҳиҳо, мавзӯъ ва амният — дар бахши умумии танзимот',
  },
  notifications: {
    section: 'Огоҳиҳо',
    push: 'Push-огоҳиҳо',
    sound: 'Садои огоҳиҳо',
    vibration: 'Ларзиш',
    typesSection: 'Навъҳои огоҳиҳо',
    types: {
      shift: 'Сменаҳо',
      schedule: 'Ҷадвал',
      request: 'Дархостҳо',
      swap: 'Ивази смена',
      chat: 'Чат',
      system: 'Системавӣ',
    },
  },
  security: {
    section: 'Амният',
    changePin: 'Иваз кардани PIN-код',
    deleteAccount: 'Нест кардани ҳисоб',
    deleteAccountDesc: 'Нест кардани бебозгашти ҳисоб ва ҳамаи маълумоти марбут',
    biometricLogin: 'Вуруд тавассути {{label}}',
    biometricHint: 'Барои вуруди зуд аз ҳимояи дастгоҳи шумо истифода мешавад.',
  },
  appearance: {
    section: 'Намуд',
    darkTheme: 'Мавзӯи торик',
  },
  changePin: {
    title: 'Иваз кардани PIN-код',
    info: 'PIN аз 4 рақам барои вуруди зуд ба барнома истифода мешавад.',
    current: 'PIN-и ҷорӣ',
    new: 'PIN-и нав',
    confirm: 'PIN-ро тасдиқ кунед',
    placeholder: '4 рақам',
    mismatch: 'PIN-кодҳо мувофиқат намекунанд',
  },
} as const;
