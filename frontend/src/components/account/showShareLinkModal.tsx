import { Stack } from "@mantine/core";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import CopyTextField from "../upload/CopyTextField";

const showShareLinkModal = (modals: ModalsContextProps, shareId: string) => {
  const t = translateOutsideContext();
  const link = `${window.location.origin}/s/${shareId}`;
  const filesJsonLink = `${link}/files.json`;
  return modals.openModal({
    title: t("account.shares.modal.share-link"),
    children: (
      <Stack align="stretch">
        <CopyTextField
          label={t("account.shares.modal.share-link")}
          link={link}
        />
        <CopyTextField label="files.json" link={filesJsonLink} />
      </Stack>
    ),
  });
};

export default showShareLinkModal;
