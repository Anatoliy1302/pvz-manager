export default {
  title: 'პარამეტრები',
  migrated: {
    title: 'პარამეტრები გადატანილია',
    description: 'შეტყობინებები, თემა და უსაფრთხოება — ზოგად პარამეტრების განყოფილებაში',
  },
  notifications: {
    section: 'შეტყობინებები',
    push: 'Push-შეტყობინებები',
    sound: 'შეტყობინების ხმა',
    vibration: 'ვიბრაცია',
    typesSection: 'შეტყობინების ტიპები',
    types: {
      shift: 'ცვლები',
      schedule: 'გრაფიკი',
      request: 'მოთხოვნები',
      swap: 'ცვლების გაცვლა',
      chat: 'ჩატი',
      system: 'სისტემური',
    },
  },
  security: {
    section: 'უსაფრთხოება',
    changePin: 'PIN-კოდის შეცვლა',
    deleteAccount: 'ანგარიშის წაშლა',
    deleteAccountDesc: 'ანგარიშისა და ყველა დაკავშირებული მონაცემის მუდმივი წაშლა',
    biometricLogin: 'შესვლა {{label}}-ით',
    biometricHint: 'სწრაფი შესვლისთვის გამოიყენება თქვენი მოწყობილობის დაცვა.',
  },
  appearance: {
    section: 'გარეგნობა',
    darkTheme: 'მუქი თემა',
  },
  changePin: {
    title: 'PIN-კოდის შეცვლა',
    info: '4-ნიშნა PIN გამოიყენება აპლიკაციაში სწრაფი შესვლისთვის.',
    current: 'მიმდინარე PIN',
    new: 'ახალი PIN',
    confirm: 'PIN-ის დადასტურება',
    placeholder: '4 ციფრი',
    mismatch: 'PIN-კოდები არ ემთხვევა',
  },
} as const;
