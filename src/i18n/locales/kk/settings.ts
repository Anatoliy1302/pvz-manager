export default {
  title: 'Баптаулар',
  migrated: {
    title: 'Баптаулар көшірілді',
    description: 'Хабарландырулар, тема және қауіпсіздік — жалпы баптаулар бөлімінде',
  },
  notifications: {
    section: 'Хабарландырулар',
    push: 'Push-хабарландырулар',
    sound: 'Хабарландыру дыбысы',
    vibration: 'Діріл',
    typesSection: 'Хабарландыру түрлері',
    types: {
      shift: 'Ауысымдар',
      schedule: 'Кесте',
      request: 'Өтініштер',
      swap: 'Ауысым алмасу',
      chat: 'Чат',
      system: 'Жүйелік',
    },
  },
  security: {
    section: 'Қауіпсіздік',
    changePin: 'PIN-кодты өзгерту',
    biometricLogin: '{{label}} арқылы кіру',
    biometricHint: 'Жылдам кіру үшін құрылғыңыздың қорғанысы пайдаланылады.',
  },
  appearance: {
    section: 'Сыртқы түр',
    darkTheme: 'Қараңғы тема',
  },
  changePin: {
    title: 'PIN-кодты өзгерту',
    info: '4 цифрдан тұратын PIN қосымшаға жылдам кіру үшін пайдаланылады.',
    current: 'Ағымдағы PIN',
    new: 'Жаңа PIN',
    confirm: 'PIN растаңыз',
    placeholder: '4 цифр',
    mismatch: 'PIN-кодтар сәйкес келмейді',
  },
} as const;
