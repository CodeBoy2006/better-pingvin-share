import {
  ColorScheme,
  ColorSchemeProvider,
  MantineProvider,
} from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { RenderOptions, render } from "@testing-library/react";
import { ReactElement, ReactNode, useState } from "react";
import { IntlProvider } from "react-intl";
import { ConfigContext } from "../src/hooks/config.hook";
import { UserContext } from "../src/hooks/user.hook";
import { LOCALES } from "../src/i18n/locales";
import globalStyle from "../src/styles/mantine.style";
import type Config from "../src/types/config.type";
import type { CurrentUser } from "../src/types/user.type";
import i18nUtil from "../src/utils/i18n.util";

const defaultConfigVariables: Config[] = [
  {
    key: "general.appName",
    defaultValue: "better-pingvin-share",
    value: "better-pingvin-share",
    type: "string",
  },
];

interface TestProvidersProps {
  children: ReactNode;
  colorScheme?: ColorScheme;
  configVariables?: Config[];
  locale?: string;
  refreshConfig?: () => Promise<void>;
  refreshUser?: () => Promise<CurrentUser | null>;
  user?: CurrentUser | null;
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  providers?: Omit<TestProvidersProps, "children">;
}

function TestProviders({
  children,
  colorScheme = "light",
  configVariables = [],
  locale = LOCALES.ENGLISH.code,
  refreshConfig = async () => {},
  refreshUser = async () => user,
  user = null,
}: TestProvidersProps) {
  const [scheme, setScheme] = useState<ColorScheme>(colorScheme);
  const mergedConfigVariables = [
    ...configVariables,
    ...defaultConfigVariables.filter(
      (defaultConfigVariable) =>
        !configVariables.some(
          (configVariable) => configVariable.key === defaultConfigVariable.key,
        ),
    ),
  ];

  return (
    <IntlProvider
      locale={locale}
      defaultLocale={LOCALES.ENGLISH.code}
      messages={i18nUtil.getLocaleByCode(locale)?.messages}
    >
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        theme={{ ...globalStyle, colorScheme: scheme }}
      >
        <ColorSchemeProvider
          colorScheme={scheme}
          toggleColorScheme={(value) => setScheme(value || "light")}
        >
          <Notifications />
          <ModalsProvider>
            <ConfigContext.Provider
              value={{
                configVariables: mergedConfigVariables,
                refresh: refreshConfig,
              }}
            >
              <UserContext.Provider
                value={{
                  user,
                  refreshUser,
                }}
              >
                {children}
              </UserContext.Provider>
            </ConfigContext.Provider>
          </ModalsProvider>
        </ColorSchemeProvider>
      </MantineProvider>
    </IntlProvider>
  );
}

export const renderWithProviders = (
  ui: ReactElement,
  options?: RenderWithProvidersOptions,
) => {
  const { providers, ...renderOptions } = options || {};

  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders {...providers}>{children}</TestProviders>
    ),
    ...renderOptions,
  });
};
