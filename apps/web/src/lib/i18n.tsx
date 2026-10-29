'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from '@aurora/ui';
import { directionOf, translate, type MessageKey } from './i18n-core';

export { MESSAGES, directionOf, translate, type MessageKey } from './i18n-core';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => undefined,
});

export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const setLocale = useCallback((locale: Locale) => {
    document.cookie = `aurora_locale=${locale}; path=/; max-age=31536000; samesite=strict`;
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
    window.location.reload();
  }, []);
  const value = useMemo(() => ({ locale: initial, setLocale }), [initial, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function useT() {
  const { locale } = useLocale();
  return useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
}
