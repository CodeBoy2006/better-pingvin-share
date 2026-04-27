import { Group, Paper, SimpleGrid, Space, Text, Title } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import ManageShareTable from "../../components/admin/shares/ManageShareTable";
import showShareAuditModal from "../../components/admin/shares/showShareAuditModal";
import showUpdateShareModal from "../../components/account/showUpdateShareModal";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { MyShare, ShareStorageStats } from "../../types/share.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";

const Shares = () => {
  const [shares, setShares] = useState<MyShare[]>([]);
  const [storageStats, setStorageStats] = useState<ShareStorageStats | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  const modals = useModals();
  const t = useTranslate();

  const getShares = async () => {
    setIsLoading(true);

    try {
      setShares(await shareService.list());

      try {
        setStorageStats(await shareService.getStorageStats());
      } catch (error) {
        toast.axiosError(error);
      }
    } catch (error) {
      toast.axiosError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteShare = (share: MyShare) => {
    modals.openConfirmModal({
      title: t("admin.shares.edit.delete.title", {
        id: share.id,
      }),
      children: (
        <Text size="sm">
          <FormattedMessage id="admin.shares.edit.delete.description" />
        </Text>
      ),
      labels: {
        confirm: t("common.button.delete"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        shareService
          .remove(share.id)
          .then(() => setShares(shares.filter((v) => v.id != share.id)))
          .catch(toast.axiosError);
      },
    });
  };

  const auditShare = (share: MyShare) => {
    showShareAuditModal(modals, share);
  };

  const editShare = (share: MyShare) => {
    showUpdateShareModal(
      modals,
      share,
      (updatedShare) =>
        setShares((shares) =>
          shares.map((share) =>
            share.id === updatedShare.id ? updatedShare : share,
          ),
        ),
      { allowUnlimitedExpiration: true },
    );
  };

  useEffect(() => {
    getShares();
  }, []);

  return (
    <>
      <Meta title={t("admin.shares.title")} />
      <Group position="apart" align="baseline" mb={20}>
        <Title mb={30} order={3}>
          <FormattedMessage id="admin.shares.title" />
        </Title>
      </Group>

      {storageStats && (
        <SimpleGrid
          cols={4}
          breakpoints={[
            { maxWidth: "lg", cols: 2 },
            { maxWidth: "sm", cols: 1 },
          ]}
          mb="lg"
        >
          <StorageStatCard
            label={t("admin.shares.storage.share-usage")}
            value={byteToHumanSizeString(storageStats.totalShareSizeBytes)}
          />
          <StorageStatCard
            label={t("admin.shares.storage.remaining-disk")}
            value={
              storageStats.disk
                ? byteToHumanSizeString(storageStats.disk.availableBytes)
                : t("admin.shares.storage.unavailable")
            }
          />
          <StorageStatCard
            label={t("admin.shares.storage.total-disk")}
            value={
              storageStats.disk
                ? byteToHumanSizeString(storageStats.disk.totalBytes)
                : t("admin.shares.storage.unavailable")
            }
          />
          <StorageStatCard
            label={t("admin.shares.storage.provider")}
            value={t(
              `admin.shares.storage.provider.${storageStats.storageProvider.toLowerCase()}`,
            )}
          />
        </SimpleGrid>
      )}

      <ManageShareTable
        shares={shares}
        auditShare={auditShare}
        deleteShare={deleteShare}
        editShare={editShare}
        isLoading={isLoading}
      />
      <Space h="xl" />
    </>
  );
};

const StorageStatCard = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <Paper withBorder p="md" radius="md">
    <Text size="sm" color="dimmed">
      {label}
    </Text>
    <Text mt={4} weight={600}>
      {value}
    </Text>
  </Paper>
);

export default Shares;
