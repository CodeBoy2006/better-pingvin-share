import { getCookie } from "cookies-next";
import { createIntl, createIntlCache, useIntl } from "react-intl";
import i18nUtil from "../utils/i18n.util";

const useTranslate = () => {
  const intl = useIntl();
  return (
    id: string,
    values?: Parameters<typeof intl.formatMessage>[1],
    opts?: Parameters<typeof intl.formatMessage>[2],
  ) => {
    return intl.formatMessage({ id }, values, opts) as string;
  };
};

const cache = createIntlCache();

const getPreferredLocale = () => {
  const cookieLanguage = getCookie("language")?.toString();

  if (cookieLanguage) {
    return i18nUtil.getLanguageFromAcceptHeader(cookieLanguage) ?? "en-US";
  }

  if (typeof navigator === "undefined") {
    return "en-US";
  }

  return i18nUtil.getLanguageFromAcceptHeader(navigator.language) ?? "en-US";
};

export const translateOutsideContext = () => {
  const locale = getPreferredLocale();

  const intl = createIntl(
    {
      locale,
      messages: i18nUtil.getLocaleByCode(locale)?.messages,
      defaultLocale: "en",
    },
    cache,
  );
  return (
    id: string,
    values?: Parameters<typeof intl.formatMessage>[1],
    opts?: Parameters<typeof intl.formatMessage>[2],
  ) => {
    return intl.formatMessage({ id }, values, opts) as string;
  };
};

export default useTranslate;
