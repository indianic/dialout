const base = require('./app.json').expo;

// Two apps on one phone: live (no Metro) vs dev (Metro). Same Apple team,
// different bundle ids so installing one never overwrites the other.
//
// The display name is Dialout; the bundle identifiers, package name and URL
// scheme stay on the old string on purpose. com.indianic.devdash is already a
// registered App ID, and renaming it means new provisioning plus existing
// installs that cannot upgrade in place — they become a second app. The public
// brand and the internal identifiers do not have to match on day one.
const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = {
  ...base,
  name: IS_DEV ? 'Dialout Dev' : 'Dialout',
  scheme: IS_DEV ? 'devdash-dev' : 'devdash',
  icon: IS_DEV ? './assets/icon-dev.png' : './assets/icon.png',
  ios: {
    ...base.ios,
    bundleIdentifier: IS_DEV ? 'com.indianic.devdash.dev' : 'com.indianic.devdash',
  },
  android: {
    ...base.android,
    package: IS_DEV ? 'com.indianic.devdash.dev' : 'com.indianic.devdash',
    adaptiveIcon: {
      ...base.android.adaptiveIcon,
      backgroundColor: '#0c0e13',
      foregroundImage: IS_DEV
        ? './assets/android-icon-foreground-dev.png'
        : './assets/android-icon-foreground.png',
    },
  },
  extra: {
    ...base.extra,
    variant: IS_DEV ? 'development' : 'live',
  },
};
