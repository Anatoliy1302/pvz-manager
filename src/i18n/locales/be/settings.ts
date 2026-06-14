export default {
  title: 'Налады',
  migrated: {
    title: 'Налады перанесены',
    description: 'Апавяшчэнні, тэма і бяспека — у агульным раздзеле налад',
  },
  notifications: {
    section: 'Апавяшчэнні',
    push: 'Push-апавяшчэнні',
    sound: 'Гук апавяшчэнняў',
    vibration: 'Вібрацыя',
    typesSection: 'Тыпы апавяшчэнняў',
    types: {
      shift: 'Змены',
      schedule: 'Расклад',
      request: 'Заяўкі',
      swap: 'Абмен змен',
      chat: 'Чат',
      system: 'Сістэмныя',
    },
  },
  security: {
    section: 'Бяспека',
    changePin: 'Змяніць PIN-код',
    biometricLogin: 'Уваход праз {{label}}',
    biometricHint: 'Для хуткага ўваходу выкарыстоўваецца абарона вашай прылады.',
  },
  appearance: {
    section: 'Знешні выгляд',
    darkTheme: 'Цёмная тэма',
  },
  changePin: {
    title: 'Змяніць PIN-код',
    info: 'PIN з 4 лічбаў выкарыстоўваецца для хуткага ўваходу ў праграму.',
    current: 'Бягучы PIN',
    new: 'Новы PIN',
    confirm: 'Пацвердзіце PIN',
    placeholder: '4 лічбы',
    mismatch: 'PIN-коды не супадаюць',
  },
} as const;
