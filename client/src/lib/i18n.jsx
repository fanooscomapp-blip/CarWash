import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import en from '../i18n/en.js';
import ar from '../i18n/ar.js';

const dicts = { en, ar };
const I18nContext = createContext(null);

function lookup(dict, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('cw_lang') || 'en');
  useEffect(() => {
    localStorage.setItem('cw_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  const value = useMemo(() => {
    const dict = dicts[lang] || en;
    const t = (key, vars) => {
      let s = lookup(dict, key) ?? lookup(en, key) ?? key;
      if (typeof s === 'string' && vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
      return s;
    };
    return { lang, setLang, t, dir: lang === 'ar' ? 'rtl' : 'ltr', isRtl: lang === 'ar' };
  }, [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;
