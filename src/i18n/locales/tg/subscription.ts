export default {
  title: 'Подписка',
  subtitle: 'Выберите тариф под размер вашего бизнеса. Pro открывает расчёт зарплаты, аналитику и экспорт отчётов.',
  currentPlan: 'Текущий тариф',
  choosePlan: 'Выберите тариф',
  popular: 'Популярный',
  upgrade: 'Перейти на Pro',
  contactUs: 'Связаться с нами',
  restore: 'Восстановить покупки',
  subscriptionActive: 'Активна',
  subscriptionInactive: 'Неактивна',
  securityNote: 'Оплата защищена. Подписку можно отменить в любой момент.',
  paymentNotAvailable: 'Оплата временно недоступна',
  paymentComingSoon:
    'Подключение платёжной системы будет доступно в ближайшем обновлении.',
  enterpriseContactHint:
    'Enterprise — от 4 950 ₽ / мес (от 5 ПВЗ). Свяжитесь с поддержкой, подберём условия под вашу сеть.',
  restoreSuccess: 'Покупки успешно восстановлены',
  trialPlanName: 'Pro (пробный)',
  trialBanner: 'Пробный Pro активен — осталось {{days}} дн. Все функции Pro доступны бесплатно.',
  earlyAdopterNote: 'Early Adopter: {{price}} / ПВЗ вместо {{standardPrice}} — на 3 месяца',
  proPriceNote: 'Оплата за каждый ПВЗ отдельно. Можно отменить в любой момент.',
  enterprisePriceFrom: 'от {{price}} / мес',
  enterprisePriceNote:
    'Минимум {{minPvz}} ПВЗ · скидка за объём. Условия для крупных сетей — по запросу.',
  exportNotAvailable: 'Экспорт доступен только в тарифе Pro',
  premiumGate: {
    title: 'Доступно в Pro',
    description:
      'Эта функция доступна на платном тарифе. Перейдите на Pro, чтобы открыть полный функционал.',
    priceHint: 'Pro — {{price}} / месяц за ПВЗ',
    upgrade: 'Перейти на Pro',
  },
  employeeLimit: {
    title: 'Достигнут лимит сотрудников',
    description:
      'На бесплатном тарифе — до {{limit}} сотрудников. Сейчас у вас {{count}}. Перейдите на Pro для безлимитного добавления.',
    upgrade: 'Перейти на Pro',
  },
  pvzLimit: {
    title: 'Лимит ПВЗ на бесплатном тарифе',
    description:
      'На бесплатном тарифе доступен {{limit}} ПВЗ. У вас уже {{count}}. Перейдите на Pro, чтобы добавить ещё точки.',
    upgrade: 'Перейти на Pro',
  },
  plans: {
    free: {
      name: 'Бесплатный',
      price: '0 ₽ / месяц',
      feature1: '1 ПВЗ',
      feature2: 'До 3 сотрудников',
      feature3: 'Управление сменами и расписанием',
      feature4: 'Расчёт зарплаты',
      feature5: 'Аналитика и отчёты',
      feature6: 'Экспорт данных',
    },
    pro: {
      name: 'Pro',
      price: '{{price}} / месяц за ПВЗ',
      feature1: 'Безлимит сотрудников',
      feature2: 'Расчёт зарплаты и выплат',
      feature3: 'Аналитика по сменам и финансам',
      feature4: 'Экспорт отчётов в CSV',
      feature5: 'Несколько ПВЗ',
      feature6: 'Приоритетная поддержка',
    },
    enterprise: {
      name: 'Enterprise',
      price: 'от 4 950 ₽ / мес',
      feature1: 'От 5 ПВЗ и выше',
      feature2: 'Все функции Pro',
      feature3: 'Персональный менеджер',
      feature4: 'Индивидуальные условия',
      feature5: 'SLA и приоритетная поддержка',
      feature6: 'Интеграции по запросу',
    },
  },
} as const;
