import { Alert, Button, Group, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import moment from "moment";
import { useState } from "react";
import { TbAlertCircle } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import ShareDetailsForm, {
  ShareDetailsFormValues,
  getShareDetailsExpirationDate,
  getShareDetailsExpirationString,
} from "../../share/ShareDetailsForm";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import shareService from "../../../services/share.service";
import { FileUpload } from "../../../types/File.type";
import { CreateShare } from "../../../types/share.type";
import { Timespan } from "../../../types/timespan.type";
import { normalizeIpAddress } from "../../../utils/ipAddress.util";
import toast from "../../../utils/toast.util";

const showCreateUploadModal = (
  modals: ModalsContextProps,
  options: {
    isUserSignedIn: boolean;
    isReverseShare: boolean;
    allowUnauthenticatedShares: boolean;
    enableEmailRecepients: boolean;
    maxExpiration: Timespan;
    defaultExpiration: Timespan;
    shareIdLength: number;
    simplified: boolean;
  },
  files: FileUpload[],
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void,
) => {
  const t = translateOutsideContext();

  if (options.simplified) {
    return modals.openModal({
      title: t("upload.modal.title"),
      children: (
        <SimplifiedCreateUploadModalModal
          options={options}
          files={files}
          uploadCallback={uploadCallback}
        />
      ),
    });
  }

  return modals.openModal({
    title: t("upload.modal.title"),
    children: (
      <CreateUploadModalBody
        options={options}
        files={files}
        uploadCallback={uploadCallback}
      />
    ),
  });
};

const generateShareId = (length: number = 16) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomArray = new Uint8Array(length >= 3 ? length : 3);
  crypto.getRandomValues(randomArray);
  randomArray.forEach((number) => {
    result += chars[number % chars.length];
  });
  return result;
};

const generateAvailableLink = async (
  shareIdLength: number,
  times: number = 10,
): Promise<string> => {
  if (times <= 0) {
    throw new Error("Could not generate available link");
  }
  const _link = generateShareId(shareIdLength);
  if (!(await shareService.isShareIdAvailable(_link))) {
    return await generateAvailableLink(shareIdLength, times - 1);
  } else {
    return _link;
  }
};

const CreateUploadModalBody = ({
  uploadCallback,
  files,
  options,
}: {
  files: FileUpload[];
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void;
  options: {
    isUserSignedIn: boolean;
    isReverseShare: boolean;
    allowUnauthenticatedShares: boolean;
    enableEmailRecepients: boolean;
    maxExpiration: Timespan;
    defaultExpiration: Timespan;
    shareIdLength: number;
  };
}) => {
  const modals = useModals();
  const t = useTranslate();

  const generatedLink = generateShareId(options.shareIdLength);

  const [showNotSignedInAlert, setShowNotSignedInAlert] = useState(true);

  const validationSchema = yup.object().shape({
    link: yup
      .string()
      .required(t("common.error.field-required"))
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(50, t("common.error.too-long", { length: 50 }))
      .matches(new RegExp("^[a-zA-Z0-9_-]*$"), {
        message: t("upload.modal.link.error.invalid"),
      }),
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    password: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
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

  const defaultTimespan = options.defaultExpiration ?? {
    value: 7,
    unit: "days",
  };

  const form = useForm<ShareDetailsFormValues>({
    initialValues: {
      name: undefined,
      link: generatedLink,
      recipients: [] as string[],
      password: undefined,
      maxViews: undefined,
      ipRestrictionMode: "disabled",
      maxIps: undefined,
      allowedIps: [] as string[],
      description: undefined,
      expiration_num: defaultTimespan.value,
      expiration_unit: `-${defaultTimespan.unit}` as string,
      never_expires: false,
    },
    validate: yupResolver(validationSchema),
  });

  const onSubmit = form.onSubmit(async (values) => {
    if (!(await shareService.isShareIdAvailable(values.link!))) {
      form.setFieldError("link", t("upload.modal.link.error.taken"));
    } else {
      const expirationString = getShareDetailsExpirationString(form.values);
      const expirationDate = getShareDetailsExpirationDate(form.values);

      if (
        options.maxExpiration.value != 0 &&
        (form.values.never_expires ||
          expirationDate.isAfter(
            moment().add(
              options.maxExpiration.value,
              options.maxExpiration.unit,
            ),
          ))
      ) {
        form.setFieldError(
          "expiration_num",
          t("upload.modal.expires.error.too-long", {
            max: moment
              .duration(options.maxExpiration.value, options.maxExpiration.unit)
              .humanize(),
          }),
        );
        return;
      }

      uploadCallback(
        {
          id: values.link!,
          name: values.name,
          expiration: expirationString,
          recipients: values.recipients,
          description: values.description,
          security: {
            password: values.password || undefined,
            maxViews: values.maxViews || undefined,
            maxIps:
              values.ipRestrictionMode === "maxIps"
                ? values.maxIps || undefined
                : undefined,
            allowedIps:
              values.ipRestrictionMode === "allowedIps"
                ? values.allowedIps
                    .map((ip) => normalizeIpAddress(ip))
                    .filter((ip): ip is string => !!ip)
                : undefined,
          },
        },
        files,
      );
      modals.closeAll();
    }
  });

  return (
    <>
      {showNotSignedInAlert && !options.isUserSignedIn && (
        <Alert
          withCloseButton
          onClose={() => setShowNotSignedInAlert(false)}
          icon={<TbAlertCircle size={16} />}
          title={t("upload.modal.not-signed-in")}
          color="yellow"
        >
          <FormattedMessage id="upload.modal.not-signed-in-description" />
        </Alert>
      )}
      <form onSubmit={onSubmit}>
        <ShareDetailsForm
          form={form}
          enableEmailRecepients={options.enableEmailRecepients}
          isReverseShare={options.isReverseShare}
          link={form.values.link}
          linkError={form.errors.link as string | null}
          maxExpiration={options.maxExpiration}
          submitLabel={<FormattedMessage id="common.button.share" />}
          linkInput={
            <Group align={form.errors.link ? "center" : "flex-end"}>
              <TextInput
                style={{ flex: "1" }}
                variant="filled"
                label={t("upload.modal.link.label")}
                placeholder="myAwesomeShare"
                {...form.getInputProps("link")}
              />
              <Button
                style={{ flex: "0 0 auto" }}
                variant="outline"
                onClick={() =>
                  form.setFieldValue(
                    "link",
                    generateShareId(options.shareIdLength),
                  )
                }
              >
                <FormattedMessage id="common.button.generate" />
              </Button>
            </Group>
          }
        />
      </form>
    </>
  );
};

const SimplifiedCreateUploadModalModal = ({
  uploadCallback,
  files,
  options,
}: {
  files: FileUpload[];
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void;
  options: {
    isUserSignedIn: boolean;
    isReverseShare: boolean;
    allowUnauthenticatedShares: boolean;
    enableEmailRecepients: boolean;
    maxExpiration: Timespan;
    shareIdLength: number;
  };
}) => {
  const modals = useModals();
  const t = useTranslate();

  const [showNotSignedInAlert, setShowNotSignedInAlert] = useState(true);

  const validationSchema = yup.object().shape({
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
  });

  const form = useForm({
    initialValues: {
      name: undefined,
      description: undefined,
    },
    validate: yupResolver(validationSchema),
  });

  const onSubmit = form.onSubmit(async (values) => {
    const link = await generateAvailableLink(options.shareIdLength).catch(
      () => {
        toast.error(t("upload.modal.link.error.taken"));
        return undefined;
      },
    );

    if (!link) {
      return;
    }

      uploadCallback(
        {
          id: link,
          name: values.name,
          expiration: "never",
          recipients: [],
          description: values.description,
          security: {},
        },
        files,
      );
      modals.closeAll();
  });

  return (
    <Stack>
      {showNotSignedInAlert && !options.isUserSignedIn && (
        <Alert
          withCloseButton
          onClose={() => setShowNotSignedInAlert(false)}
          icon={<TbAlertCircle size={16} />}
          title={t("upload.modal.not-signed-in")}
          color="yellow"
        >
          <FormattedMessage id="upload.modal.not-signed-in-description" />
        </Alert>
      )}
      <form onSubmit={onSubmit}>
        <Stack align="stretch">
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
          <Button type="submit" data-autofocus>
            <FormattedMessage id="common.button.share" />
          </Button>
        </Stack>
      </form>
    </Stack>
  );
};

export default showCreateUploadModal;
