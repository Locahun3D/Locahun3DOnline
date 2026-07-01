"use client";
import { createContext, useContext } from "react";
import {
  localizedHref,
  translate,
  type DictKey,
  type Locale,
} from "@/lib/i18n/dictionaries";

const LocaleCtx = createContext<Locale>("ja");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleCtx.Provider value={locale}>{children}</LocaleCtx.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleCtx);
}

/** クライアント用 t。`const t = useT(); t("nav.pricing")` */
export function useT(): (key: DictKey) => string {
  const locale = useContext(LocaleCtx);
  return (key: DictKey) => translate(locale, key);
}

/** クライアントから locale を考慮した href を作る（EN中は /en を付ける）。 */
export function useHref(): (href: string) => string {
  const locale = useContext(LocaleCtx);
  return (href: string) => localizedHref(href, locale);
}
