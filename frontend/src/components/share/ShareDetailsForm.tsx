import {
  Accordion,
  Button,
  Checkbox,
  Col,
  Grid,
  MultiSelect,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import moment from "moment";
import type React from "react";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import { Timespan } from "../../types/timespan.type";
import { getExpirationPreview } from "../../utils/date.util";
import { normalizeIpAddress } from "../../utils/ipAddress.util";

export type ShareDetailsFormValues = {
  name?: string;
  link?: string;
  recipients: string[];
  password?: string;
  maxViews?: number;
  ipRestrictionMode: string;
  maxIps?: number;
  allowedIps: string[];
  description?: string;
  expiration_num: number;
  expiration_unit: string;
  never_expires: boolean;
};

const expirationUnits = [
  { value: "minutes", labelKey: "minute" },
  { value: "hours", labelKey: "hour" },
  { value: "days", labelKey: "day" },
  { value: "weeks", labelKey: "week" },
  { value: "months", labelKey: "month" },
  { value: "years", labelKey: "year" },
] as const;

const ShareDetailsForm = ({
  form,
  enableEmailRecepients,
  isReverseShare = false,
  link,
  linkError,
  linkInput,
  maxExpiration,
  submitLabel,
}: {
  form: UseFormReturnType<ShareDetailsFormValues>;
  enableEmailRecepients: boolean;
  isReverseShare?: boolean;
  link?: string;
  linkError?: string | null;
  linkInput?: React.ReactNode;
  maxExpiration?: Timespan;
  submitLabel: React.ReactNode;
}) => {
  const t = useTranslate();

  return (
    <Stack align="stretch">
      {linkInput}
      {link && (
        <Text
          truncate
          italic
          size="xs"
          sx={(theme) => ({
            color: theme.colors.gray[6],
          })}
        >
          {`${window.location.origin}/s/${link}`}
        </Text>
      )}
      {!isReverseShare && (
        <>
          <Grid align={linkError ? "center" : "flex-end"}>
            <Col xs={6}>
              <NumberInput
                min={1}
                max={99999}
                precision={0}
                variant="filled"
                label={t("upload.modal.expires.label")}
                disabled={form.values.never_expires}
                {...form.getInputProps("expiration_num")}
              />
            </Col>
            <Col xs={6}>
              <Select
                disabled={form.values.never_expires}
                {...form.getInputProps("expiration_unit")}
                data={expirationUnits.map((unit) => ({
                  value: `-${unit.value}`,
                  label:
                    form.values.expiration_num == 1
                      ? t(`upload.modal.expires.${unit.labelKey}-singular`)
                      : t(`upload.modal.expires.${unit.labelKey}-plural`),
                }))}
              />
            </Col>
          </Grid>
          {maxExpiration && maxExpiration.value == 0 && (
            <Checkbox
              label={t("upload.modal.expires.never-long")}
              checked={form.values.never_expires}
              onChange={(event) =>
                form.setFieldValue("never_expires", event.currentTarget.checked)
              }
            />
          )}
          <Text size="sm" color="dimmed">
            {getExpirationPreview(
              {
                neverExpires: t("upload.modal.completed.never-expires"),
                expiresOn: t("upload.modal.completed.expires-on"),
              },
              form,
            )}
          </Text>
        </>
      )}
      <Accordion>
        <Accordion.Item value="description" sx={{ borderBottom: "none" }}>
          <Accordion.Control>
            <FormattedMessage id="upload.modal.accordion.name-and-description.title" />
          </Accordion.Control>
          <Accordion.Panel>
            <Stack align="stretch">
              <TextInput
                variant="filled"
                placeholder={t(
                  "upload.modal.accordion.name-and-description.name.placeholder",
                )}
                {...form.getInputProps("name")}
              />
              <Textarea
                variant="filled"
                placeholder={t(
                  "upload.modal.accordion.name-and-description.description.placeholder",
                )}
                {...form.getInputProps("description")}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        {enableEmailRecepients && (
          <Accordion.Item value="recipients" sx={{ borderBottom: "none" }}>
            <Accordion.Control>
              <FormattedMessage id="upload.modal.accordion.email.title" />
            </Accordion.Control>
            <Accordion.Panel>
              <MultiSelect
                data={form.values.recipients}
                placeholder={t("upload.modal.accordion.email.placeholder")}
                searchable
                creatable
                id="recipient-emails"
                inputMode="email"
                getCreateLabel={(query) => `+ ${query}`}
                onCreate={(query) => {
                  if (!query.match(/^\S+@\S+\.\S+$/)) {
                    form.setFieldError(
                      "recipients",
                      t("upload.modal.accordion.email.invalid-email"),
                    );
                  } else {
                    form.setFieldError("recipients", null);
                    form.setFieldValue("recipients", [
                      ...form.values.recipients,
                      query,
                    ]);
                    return query;
                  }
                }}
                {...form.getInputProps("recipients")}
                onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                  if (
                    event.key === "Enter" ||
                    event.key === "," ||
                    event.key === ";"
                  ) {
                    event.preventDefault();
                    const inputValue = (
                      event.target as HTMLInputElement
                    ).value.trim();
                    if (inputValue.match(/^\S+@\S+\.\S+$/)) {
                      form.setFieldValue("recipients", [
                        ...form.values.recipients,
                        inputValue,
                      ]);
                      (event.target as HTMLInputElement).value = "";
                    }
                  } else if (event.key === " ") {
                    event.preventDefault();
                    (event.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </Accordion.Panel>
          </Accordion.Item>
        )}

        <Accordion.Item value="security" sx={{ borderBottom: "none" }}>
          <Accordion.Control>
            <FormattedMessage id="upload.modal.accordion.security.title" />
          </Accordion.Control>
          <Accordion.Panel>
            <Stack align="stretch">
              <PasswordInput
                variant="filled"
                placeholder={t(
                  "upload.modal.accordion.security.password.placeholder",
                )}
                label={t("upload.modal.accordion.security.password.label")}
                autoComplete="new-password"
                {...form.getInputProps("password")}
              />
              <NumberInput
                min={1}
                type="number"
                variant="filled"
                placeholder={t(
                  "upload.modal.accordion.security.max-views.placeholder",
                )}
                label={t("upload.modal.accordion.security.max-views.label")}
                {...form.getInputProps("maxViews")}
              />
              <Select
                variant="filled"
                label={t("upload.modal.accordion.security.ip-mode.label")}
                data={[
                  {
                    value: "disabled",
                    label: t("upload.modal.accordion.security.ip-mode.disabled"),
                  },
                  {
                    value: "maxIps",
                    label: t("upload.modal.accordion.security.ip-mode.max-ips"),
                  },
                  {
                    value: "allowedIps",
                    label: t(
                      "upload.modal.accordion.security.ip-mode.allowed-ips",
                    ),
                  },
                ]}
                {...form.getInputProps("ipRestrictionMode")}
              />
              {form.values.ipRestrictionMode === "maxIps" && (
                <NumberInput
                  min={1}
                  type="number"
                  variant="filled"
                  placeholder={t(
                    "upload.modal.accordion.security.max-ips.placeholder",
                  )}
                  label={t("upload.modal.accordion.security.max-ips.label")}
                  {...form.getInputProps("maxIps")}
                />
              )}
              {form.values.ipRestrictionMode === "allowedIps" && (
                <Stack spacing={4}>
                  <MultiSelect
                    data={form.values.allowedIps}
                    placeholder={t(
                      "upload.modal.accordion.security.ip-allowed.placeholder",
                    )}
                    searchable
                    creatable
                    clearable
                    getCreateLabel={(query) => `+ ${query}`}
                    onCreate={(query) => {
                      const normalizedIp = normalizeIpAddress(query);

                      if (!normalizedIp) {
                        form.setFieldError(
                          "allowedIps",
                          t(
                            "upload.modal.accordion.security.ip-allowed.invalid",
                          ),
                        );
                        return null;
                      }

                      form.setFieldError("allowedIps", null);

                      if (!form.values.allowedIps.includes(normalizedIp)) {
                        form.setFieldValue("allowedIps", [
                          ...form.values.allowedIps,
                          normalizedIp,
                        ]);
                      }

                      return normalizedIp;
                    }}
                    label={t("upload.modal.accordion.security.ip-allowed.label")}
                    {...form.getInputProps("allowedIps")}
                  />
                  <Text size="xs" color="dimmed">
                    <FormattedMessage id="upload.modal.accordion.security.ip-allowed.description" />
                  </Text>
                </Stack>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Button type="submit" data-autofocus>
        {submitLabel}
      </Button>
    </Stack>
  );
};

export const getShareDetailsExpirationString = (
  values: Pick<
    ShareDetailsFormValues,
    "never_expires" | "expiration_num" | "expiration_unit"
  >,
) =>
  values.never_expires
    ? "never"
    : values.expiration_num + values.expiration_unit;

export const getShareDetailsExpirationDate = (
  values: Pick<ShareDetailsFormValues, "expiration_num" | "expiration_unit">,
) =>
  moment().add(
    values.expiration_num,
    values.expiration_unit.replace(
      "-",
      "",
    ) as moment.unitOfTime.DurationConstructor,
  );

export default ShareDetailsForm;
