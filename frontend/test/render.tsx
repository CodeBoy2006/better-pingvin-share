import {
  ColorScheme,
  ColorSchemeProvider,
  MantineProvider,
} from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import {
  RenderHookOptions,
  RenderOptions,
  render,
  renderHook,
} from "@testing-library/react";
import { ReactElement, ReactNode, useState } from "react";
import { IntlProvider } from "react-intl";
import { ConfigContext } from "../src/hooks/config.hook";
import { UserContext } from "../src/hooks/user.hook";
import { LOCALES } from "../src/i18n/locales";
import globalStyle from "../src/styles/mantine.style";
import type Config from "../src/types/config.type";
import type { CurrentUser } from "../src/types/user.type";
import i18nUtil from "../src/utils/i18n.util";
import type { MockRouterOverrides } from "./router";
import { setMockRouter } from "./router";

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
  configRefresh?: () => Promise<void> | void;
  locale?: string;
  refreshConfig?: () => Promise<void> | void;
  refreshUser?: () => Promise<CurrentUser | null>;
  router?: MockRouterOverrides;
  user?: CurrentUser | null;
  userRefresh?: () => Promise<CurrentUser | null>;
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  providers?: Omit<TestProvidersProps, "children">;
}

interface RenderHookWithProvidersOptions<Props>
  extends Omit<RenderHookOptions<Props>, "wrapper"> {
  providers?: Omit<TestProvidersProps, "children">;
}

function TestProviders({
  children,
  colorScheme = "light",
  configVariables = [],
  configRefresh = async () => {},
  locale = LOCALES.ENGLISH.code,
  refreshConfig,
  refreshUser,
  user = null,
  userRefresh = async () => user,
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
  const resolvedConfigRefresh = refreshConfig ?? configRefresh;
  const resolvedUserRefresh = refreshUser ?? userRefresh;

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
                refresh: resolvedConfigRefresh,
              }}
            >
              <UserContext.Provider
                value={{
                  user,
                  refreshUser: resolvedUserRefresh,
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

const createWrapper = (providers?: Omit<TestProvidersProps, "children">) => {
  if (providers?.router) {
    setMockRouter(providers.router);
  }

  return ({ children }: { children: ReactNode }) => (
    <TestProviders {...providers}>{children}</TestProviders>
  );
};

export const renderWithProviders = (
  ui: ReactElement,
  options?: RenderWithProvidersOptions,
) => {
  const { providers, ...renderOptions } = options || {};

  return render(ui, {
    wrapper: createWrapper(providers),
    ...renderOptions,
  });
};

export const renderHookWithProviders = <Result, Props>(
  renderCallback: (initialProps: Props) => Result,
  options?: RenderHookWithProvidersOptions<Props>,
) => {
  const { providers, ...renderOptions } = options || {};

  return renderHook(renderCallback, {
    wrapper: createWrapper(providers),
    ...renderOptions,
  });
};
