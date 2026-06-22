require('dotenv/config');



const appJson = require('./app.json');



const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://79.137.192.194:3000';

let apiHost = '79.137.192.194';

let isHttps = false;

try {

  const parsed = new URL(apiUrl);

  apiHost = parsed.hostname;

  isHttps = parsed.protocol === 'https:';

} catch {

  // keep defaults

}



const existingAts =

  appJson.expo.ios?.infoPlist?.NSAppTransportSecurity?.NSExceptionDomains ?? {};



const atsDomains = {

  ...existingAts,

  'api.pvzpersonal.ru': {

    NSIncludesSubdomains: true,

    NSExceptionMinimumTLSVersion: 'TLSv1.2',

  },

};



if (!isHttps) {

  atsDomains[apiHost] = {

    NSExceptionAllowsInsecureHTTPLoads: true,

    NSIncludesSubdomains: false,

  };

}



/** @type {import('expo/config').ExpoConfig} */

module.exports = {

  expo: {

    ...appJson.expo,

    android: {

      ...appJson.expo.android,

      usesCleartextTraffic: !isHttps,

    },

    ios: {

      ...appJson.expo.ios,

      infoPlist: {

        ...appJson.expo.ios?.infoPlist,

        NSAppTransportSecurity: {

          NSExceptionDomains: atsDomains,

        },

      },

    },

    extra: {

      ...appJson.expo.extra,

      EXPO_PUBLIC_API_URL: apiUrl,

      EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP:

        process.env.EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP ?? 'true',

      EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP:

        process.env.EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP ?? 'false',

      EXPO_PUBLIC_DEMO_MODE: process.env.EXPO_PUBLIC_DEMO_MODE,

      demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === 'true',

      EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? 'production',

    },

  },

};

