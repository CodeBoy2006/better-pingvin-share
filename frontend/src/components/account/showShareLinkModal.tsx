import { Collapse, Stack } from "@mantine/core";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { useState } from "react";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import QRCode from "../share/QRCode";
import CopyTextField from "../upload/CopyTextField";

const showShareLinkModal = (modals: ModalsContextProps, shareId: string) => {
  const t = translateOutsideContext();
  return modals.openModal({
    title: t("account.shares.modal.share-link"),
    children: <Body shareId={shareId} />,
  });
};

const Body = ({ shareId }: { shareId: string }) => {
  const [showQRCode, setShowQRCode] = useState(false);
  const t = translateOutsideContext();
  const link = `${window.location.origin}/s/${shareId}`;
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
    </Stack>
  );
};

export default showShareLinkModal;
