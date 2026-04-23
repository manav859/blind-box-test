// Minimal i18next init to silence the "pass in an i18next instance" warning
// that comes from @shoplinedev/appbridge's internal react-i18next usage.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
});

export default i18n;
