require('dotenv/config');

const appJson = require('./app.json');

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP: process.env.EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP,
      EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP: process.env.EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP,
      EXPO_PUBLIC_DEMO_MODE: process.env.EXPO_PUBLIC_DEMO_MODE,
      demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === 'true',
      EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? 'production',
    },
  },
};
