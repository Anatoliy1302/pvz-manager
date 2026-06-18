export default {
  title: 'Կարգավորումներ',
  migrated: {
    title: 'Կարգավորումները տեղափոխվել են',
    description: 'Ծանուցումներ, թեմա և անվտանգություն՝ ընդհանուր կարգավորումների բաժնում',
  },
  notifications: {
    section: 'Ծանուցումներ',
    push: 'Push-ծանուցումներ',
    sound: 'Ծանուցման ձայն',
    vibration: 'Թրթռում',
    typesSection: 'Ծանուցումների տեսակներ',
    types: {
      shift: 'Հերթափոխեր',
      schedule: 'Գրաֆիկ',
      request: 'Հայտեր',
      swap: 'Հերթափոխերի փոխանակում',
      chat: 'Զրույց',
      system: 'Համակարգային',
    },
  },
  security: {
    section: 'Անվտանգություն',
    changePin: 'Փոխել PIN-կոդը',
    deleteAccount: 'Ջնջել հաշիվը',
    deleteAccountDesc: 'Հաշվի և բոլոր կապված տվյալների մշտական ջնջում',
    biometricLogin: 'Մուտք {{label}}-ով',
    biometricHint: 'Արագ մուտքի համար օգտագործվում է ձեր սարքի պաշտպանությունը։',
  },
  appearance: {
    section: 'Տեսք',
    darkTheme: 'Մուգ թեմա',
  },
  changePin: {
    title: 'Փոխել PIN-կոդը',
    info: '4 նիշանոց PIN-ը օգտագործվում է հավելվածում արագ մուտքի համար։',
    current: 'Ընթացիկ PIN',
    new: 'Նոր PIN',
    confirm: 'Հաստատեք PIN-ը',
    placeholder: '4 նիշ',
    mismatch: 'PIN-կոդերը չեն համընկնում',
  },
} as const;
