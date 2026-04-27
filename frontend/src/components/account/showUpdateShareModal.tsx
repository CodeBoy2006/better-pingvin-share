import { useForm, yupResolver } from "@mantine/form";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import moment from "moment";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import ShareDetailsForm, {
  ShareDetailsFormValues,
  getShareDetailsExpirationDate,
  getShareDetailsExpirationString,
} from "../share/ShareDetailsForm";
import useConfig from "../../hooks/config.hook";
import useTranslate, {
  translateOutsideContext,
} from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { MyShare } from "../../types/share.type";
import { normalizeIpAddress } from "../../utils/ipAddress.util";
import toast from "../../utils/toast.util";

const getExpirationInitialValues = (expiration: Date) => {
  if (moment(expiration).unix() === 0) {
    return {
      expiration_num: 1,
      expiration_unit: "-days",
      never_expires: true,
    };
  }

  const diffMinutes = Math.max(1, moment(expiration).diff(moment(), "minutes"));
  const units = [
    { unit: "years", minutes: 365 * 24 * 60 },
    { unit: "months", minutes: 30 * 24 * 60 },
    { unit: "weeks", minutes: 7 * 24 * 60 },
    { unit: "days", minutes: 24 * 60 },
    { unit: "hours", minutes: 60 },
    { unit: "minutes", minutes: 1 },
  ];
  const selectedUnit =
    units.find((item) => diffMinutes >= item.minutes) ?? units[units.length - 1];

  return {
    expiration_num: Math.max(1, Math.ceil(diffMinutes / selectedUnit.minutes)),
    expiration_unit: `-${selectedUnit.unit}`,
    never_expires: false,
  };
};

const getIpRestrictionMode = (share: MyShare) => {
  if (share.security?.allowedIps?.length) return "allowedIps";
  if (share.security?.maxIps) return "maxIps";
  return "disabled";
};

export const UpdateShareModalBody = ({
  share,
  allowUnlimitedExpiration = false,
  onUpdated,
}: {
  share: MyShare;
  allowUnlimitedExpiration?: boolean;
  onUpdated?: (share: MyShare) => void;
}) => {
  const t = useTranslate();
  const config = useConfig();
  const maxExpiration = config.get("share.maxExpiration");
  const enableEmailRecepients = config.get("email.enableShareEmailRecipients");

  const validationSchema = yup.object().shape({
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    password: yup
      .string()
      .transform((value) => (value === "" ? value : value || undefined))
      .test(
        "empty-or-length",
        t("common.error.too-short", { length: 3 }),
        (value) => value === undefined || value === "" || value.length >= 3,
      )
      .max(30, t("common.error.too-long", { length: 30 })),
    maxViews: yup
      .number()
      .transform((value) => value || undefined)
      .min(1),
    ipRestrictionMode: yup
      .string()
      .oneOf(["disabled", "maxIps", "allowedIps"])
      .required(),
    maxIps: yup
      .number()
      .transform((value) => value || undefined)
      .when("ipRestrictionMode", {
        is: "maxIps",
        then: (schema) =>
          schema.required(t("common.error.field-required")).min(1),
        otherwise: (schema) => schema.optional(),
      }),
    allowedIps: yup
      .array()
      .of(yup.string().required())
      .when("ipRestrictionMode", {
        is: "allowedIps",
        then: (schema) =>
          schema
            .min(1, t("common.error.field-required"))
            .test(
              "allowed-ips",
              t("upload.modal.accordion.security.ip-allowed.invalid"),
              (value) =>
                (value ?? []).every(
                  (ip) => normalizeIpAddress(ip) !== undefined,
                ),
            ),
        otherwise: (schema) => schema.optional(),
      }),
  });

  const form = useForm<ShareDetailsFormValues>({
    initialValues: {
      name: share.name ?? undefined,
      recipients: share.recipients ?? [],
      password: undefined,
      maxViews: share.security?.maxViews || undefined,
      ipRestrictionMode: getIpRestrictionMode(share),
      maxIps: share.security?.maxIps || undefined,
      allowedIps: share.security?.allowedIps ?? [],
      description: share.description ?? undefined,
      ...getExpirationInitialValues(share.expiration),
    },
    validate: yupResolver(validationSchema),
  });

  const onSubmit = form.onSubmit(async (values) => {
    const expirationString = getShareDetailsExpirationString(values);
    const expirationDate = getShareDetailsExpirationDate(values);

    if (
      !allowUnlimitedExpiration &&
      maxExpiration.value != 0 &&
      (values.never_expires ||
        expirationDate.isAfter(
          moment().add(maxExpiration.value, maxExpiration.unit),
        ))
    ) {
      form.setFieldError(
        "expiration_num",
        t("upload.modal.expires.error.too-long", {
          max: moment
            .duration(maxExpiration.value, maxExpiration.unit)
            .humanize(),
        }),
      );
      return;
    }

    try {
      const updatedShare = await shareService.update(share.id, {
        name: values.name,
        expiration: expirationString,
        recipients: values.recipients,
        description: values.description,
        security: {
          password: values.password,
          maxViews: values.maxViews ?? null,
          maxIps:
            values.ipRestrictionMode === "maxIps"
              ? (values.maxIps ?? null)
              : null,
          allowedIps:
            values.ipRestrictionMode === "allowedIps"
              ? values.allowedIps
                  .map((ip) => normalizeIpAddress(ip))
                  .filter((ip): ip is string => !!ip)
              : [],
        },
      });

      toast.success(t("share.edit.notify.save-success"));
      onUpdated?.(updatedShare);
    } catch (error) {
      toast.axiosError(error);
    }
  });

  return (
    <form onSubmit={onSubmit}>
      <ShareDetailsForm
        form={form}
        enableEmailRecepients={enableEmailRecepients}
        maxExpiration={maxExpiration}
        submitLabel={<FormattedMessage id="common.button.save" />}
      />
    </form>
  );
};

const showUpdateShareModal = (
  modals: ModalsContextProps,
  share: MyShare,
  onUpdated?: (share: MyShare) => void,
  options?: { allowUnlimitedExpiration?: boolean },
) => {
  const t = translateOutsideContext();

  return modals.openModal({
    title: t("share.edit.settings-title", { shareId: share.id }),
    children: (
      <UpdateShareModalBody
        share={share}
        allowUnlimitedExpiration={options?.allowUnlimitedExpiration}
        onUpdated={onUpdated}
      />
    ),
  });
};

export default showUpdateShareModal;
