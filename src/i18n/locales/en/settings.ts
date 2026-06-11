export default {
  title: 'Settings',
  migrated: {
    title: 'Settings moved',
    description: 'Notifications, theme, and security are in the general settings section',
  },
  notifications: {
    section: 'Notifications',
    push: 'Push notifications',
    sound: 'Notification sound',
    vibration: 'Vibration',
  },
  security: {
    section: 'Security',
    changePin: 'Change PIN',
    biometricLogin: 'Sign in with {{label}}',
    biometricHint: 'Your device security is used for quick sign-in.',
  },
  appearance: {
    section: 'Appearance',
    darkTheme: 'Dark theme',
  },
  changePin: {
    title: 'Change PIN',
    info: 'A 4-digit PIN is used for quick sign-in to the app.',
    current: 'Current PIN',
    new: 'New PIN',
    confirm: 'Confirm PIN',
    placeholder: '4 digits',
    mismatch: 'PIN codes do not match',
  },
} as const;
