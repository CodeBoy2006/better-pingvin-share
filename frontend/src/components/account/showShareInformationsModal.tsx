import { Collapse, Divider, Flex, Progress, Stack, Text } from "@mantine/core";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import moment from "moment";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import { MyShare } from "../../types/share.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import QRCode from "../share/QRCode";
import CopyTextField from "../upload/CopyTextField";

const showShareInformationsModal = (
  modals: ModalsContextProps,
  share: MyShare,
  maxShareSize: number,
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    title: t("account.shares.modal.share-informations"),
    children: <Body share={share} maxShareSize={maxShareSize} />,
  });
};

const Body = ({
  share,
  maxShareSize,
}: {
  share: MyShare;
  maxShareSize: number;
}) => {
  const [showQRCode, setShowQRCode] = useState(false);
  const t = translateOutsideContext();
  const link = `${window.location.origin}/s/${share.id}`;
  const filesJsonLink = `${link}/files.json`;

  const formattedShareSize = byteToHumanSizeString(share.size);
  const formattedMaxShareSize = byteToHumanSizeString(maxShareSize);
  const shareSizeProgress = (share.size / maxShareSize) * 100;

  const formattedCreatedAt = moment(share.createdAt).format("LLL");
  const formattedExpiration =
    moment(share.expiration).unix() === 0
      ? "Never"
      : moment(share.expiration).format("LLL");

  return (
    <Stack align="stretch" spacing="md">
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.id" />:{" "}
        </b>
        {share.id}
      </Text>
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.name" />:{" "}
        </b>
        {share.name || "-"}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.description" />:{" "}
        </b>
        {share.description || "-"}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.createdAt" />:{" "}
        </b>
        {formattedCreatedAt}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.expiresAt" />:{" "}
        </b>
        {formattedExpiration}
      </Text>
      <Divider />
      <CopyTextField
        label={t("account.shares.modal.share-link")}
        link={link}
        toggleQR={() => setShowQRCode((value) => !value)}
      />
      <Collapse in={showQRCode}>
        <QRCode link={link} />
      </Collapse>
      <CopyTextField label="files.json" link={filesJsonLink} />
      <Divider />
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.size" />:{" "}
        </b>
        {formattedShareSize} / {formattedMaxShareSize} (
        {shareSizeProgress.toFixed(1)}%)
      </Text>

      <Flex align="center" justify="center">
        {share.size / maxShareSize < 0.1 && (
          <Text size="xs" style={{ marginRight: "4px" }}>
            {formattedShareSize}
          </Text>
        )}
        <Progress
          value={shareSizeProgress}
          label={share.size / maxShareSize >= 0.1 ? formattedShareSize : ""}
          style={{ width: share.size / maxShareSize < 0.1 ? "70%" : "80%" }}
          size="xl"
          radius="xl"
        />
        <Text size="xs" style={{ marginLeft: "4px" }}>
          {formattedMaxShareSize}
        </Text>
      </Flex>
    </Stack>
  );
};

export default showShareInformationsModal;
