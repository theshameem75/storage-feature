import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  fallbackLng: 'en-US',
  lng: localStorage.getItem('blocks-os-language') || 'en-US',
  ns: ['construct'],
  defaultNS: 'construct',
  interpolation: {
    escapeValue: false,
  },
  react: {
    // re-render components when a translation bundle is added at runtime
    // (UILM files are fetched after first paint), not only on languageChanged
    bindI18nStore: 'added',
  },
  resources: {
    'en-US': {
      construct: {},
    },
  },
});

export default i18n;
