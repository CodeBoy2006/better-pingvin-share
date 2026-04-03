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

interface TestProvidersProps {
  children: ReactNode;
  colorScheme?: ColorScheme;
  configVariables?: Config[];
  locale?: string;
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
  user = null,
}: TestProvidersProps) {
  const [scheme, setScheme] = useState<ColorScheme>(colorScheme);

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
                configVariables,
                refresh: async () => {},
              }}
            >
              <UserContext.Provider
                value={{
                  user,
                  refreshUser: async () => user,
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
