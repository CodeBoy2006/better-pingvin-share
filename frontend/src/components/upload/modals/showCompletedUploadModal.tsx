import { Button, Collapse, Stack, Text } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import moment from "moment";
import { useRouter } from "next/router";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import QRCode from "../../share/QRCode";
import { CompletedShare } from "../../../types/share.type";
import CopyTextField from "../CopyTextField";

const showCompletedUploadModal = (
  modals: ModalsContextProps,
  share: CompletedShare,
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    closeOnClickOutside: false,
    withCloseButton: false,
    closeOnEscape: false,
    title: t("upload.modal.completed.share-ready"),
    children: <Body share={share} />,
  });
};

const Body = ({ share }: { share: CompletedShare }) => {
  const modals = useModals();
  const router = useRouter();
  const t = useTranslate();
  const [showQRCode, setShowQRCode] = useState(false);

  const isReverseShare = !!router.query["reverseShareToken"];

  const link = `${window.location.origin}/s/${share.id}`;
  const filesJsonLink = `${link}/files.json`;

  return (
    <Stack align="stretch">
      <CopyTextField
        label={t("account.shares.modal.share-link")}
        link={link}
        toggleQR={() => setShowQRCode((value) => !value)}
      />
      <Collapse in={showQRCode}>
        <QRCode link={link} />
      </Collapse>
      <CopyTextField label="files.json" link={filesJsonLink} />
      {share.ownerManagementLink && (
        <>
          <Text
            size="sm"
            sx={(theme) => ({
              color:
                theme.colorScheme === "dark"
                  ? theme.colors.gray[3]
                  : theme.colors.dark[4],
            })}
          >
            {t("share.edit.title", { shareId: share.id })}
          </Text>
          <CopyTextField link={share.ownerManagementLink} />
        </>
      )}
      {share.notifyReverseShareCreator === true && (
        <Text
          size="sm"
          sx={(theme) => ({
            color:
              theme.colorScheme === "dark"
                ? theme.colors.gray[3]
                : theme.colors.dark[4],
          })}
        >
          {t("upload.modal.completed.notified-reverse-share-creator")}
        </Text>
      )}
      <Text
        size="xs"
        sx={(theme) => ({
          color: theme.colors.gray[6],
        })}
      >
        {/* If our share.expiration is timestamp 0, show a different message */}
        {moment(share.expiration).unix() === 0
          ? t("upload.modal.completed.never-expires")
          : t("upload.modal.completed.expires-on", {
              expiration: moment(share.expiration).format("LLL"),
            })}
      </Text>

      <Button
        onClick={() => {
          modals.closeAll();
          if (isReverseShare) {
            router.reload();
          } else {
            router.push("/upload");
          }
        }}
      >
        <FormattedMessage id="common.button.done" />
      </Button>
    </Stack>
  );
};

export default showCompletedUploadModal;
