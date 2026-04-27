import { Collapse, Divider, Flex, Progress, Stack, Text } from "@mantine/core";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import moment from "moment";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import { MyShare } from "../../types/share.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import { getShareListLinks } from "../../utils/shareListLinks.util";
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
  const { link, filesJsonLink, filesTextLink } = getShareListLinks(share.id);

  const formattedShareSize = byteToHumanSizeString(share.size);
  const formattedMaxShareSize = byteToHumanSizeString(maxShareSize);
  const shareSizeProgress = (share.size / maxShareSize) * 100;

  const formattedCreatedAt = moment(share.createdAt).format("LLL");
  const formattedExpiration =
    moment(share.expiration).unix() === 0
      ? "Never"
      : moment(share.expiration).format("LLL");
  const formattedIpAccess = share.security.allowedIps?.length
    ? t("account.shares.modal.security.ip-mode.allowed-ips", {
        count: share.security.allowedIps.length,
      })
    : share.security.maxIps
      ? t("account.shares.modal.security.ip-mode.max-ips", {
          count: share.security.maxIps,
        })
      : t("account.shares.modal.security.disabled");

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
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.modal.security.password" />:{" "}
        </b>
        {share.security.passwordProtected
          ? t("account.shares.modal.security.enabled")
          : t("account.shares.modal.security.disabled")}
      </Text>
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.modal.security.max-views" />
          :{" "}
        </b>
        {share.security.maxViews ?? t("account.shares.modal.security.no-limit")}
      </Text>
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.modal.security.ip-access" />
          :{" "}
        </b>
        {formattedIpAccess}
      </Text>
      {share.security.allowedIps && share.security.allowedIps.length > 0 && (
        <Text size="sm">
          <b>
            <FormattedMessage id="account.shares.modal.security.allowed-ips" />
            :{" "}
          </b>
          {share.security.allowedIps.join(", ")}
        </Text>
      )}
      {share.security.maxIps && (
        <Text size="sm">
          <b>
            <FormattedMessage id="account.shares.modal.security.assigned-ips" />
            :{" "}
          </b>
          {share.security.assignedIps && share.security.assignedIps.length > 0
            ? share.security.assignedIps.join(", ")
            : "-"}
        </Text>
      )}
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
      <CopyTextField label="files.txt" link={filesTextLink} />
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
