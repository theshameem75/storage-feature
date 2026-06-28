import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  fallbackLng: 'en-US',
  lng: localStorage.getItem('blocks-os-language') || 'en-US',
  ns: ['translation', 'common'],
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
  resources: {
    'en-US': {
      translation: {},
    },
  },
});

export default i18n;
