import {
  ActionIcon,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { useEffect, useState } from "react";
import { TbDownload } from "react-icons/tb";
import shareService from "../../../services/share.service";
import { FileMetaData } from "../../../types/File.type";
import { AdminShareAudit, MyShare } from "../../../types/share.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import toast from "../../../utils/toast.util";

const showShareAuditModal = (modals: ModalsContextProps, share: MyShare) => {
  return modals.openModal({
    title: `Admin file audit: ${share.id}`,
    size: "lg",
    children: <Body share={share} />,
  });
};

const Body = ({ share }: { share: MyShare }) => {
  const [auditShare, setAuditShare] = useState<AdminShareAudit>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    shareService
      .getAdminAuditShare(share.id)
      .then((result) => {
        if (isMounted) {
          setAuditShare(result);
        }
      })
      .catch(toast.axiosError)
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [share.id]);

  if (isLoading) {
    return (
      <Group position="center" py="xl">
        <Loader />
      </Group>
    );
  }

  const files = auditShare?.files ?? [];

  return (
    <Stack spacing="md">
      <Text size="sm" color="dimmed">
        Admin-only access for retained files. Public share links and files.json
        stay unavailable after expiration.
      </Text>
      <Group position="apart">
        <Title order={5}>Files</Title>
        <Text size="sm" color="dimmed">
          {files.length} file{files.length === 1 ? "" : "s"}
        </Text>
      </Group>

      {files.length === 0 ? (
        <Text size="sm" color="dimmed">
          No retained files are listed for this share.
        </Text>
      ) : (
        <Table verticalSpacing="sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <AuditFileRow key={file.id} file={file} shareId={share.id} />
            ))}
          </tbody>
        </Table>
      )}
    </Stack>
  );
};

const AuditFileRow = ({
  file,
  shareId,
}: {
  file: FileMetaData;
  shareId: string;
}) => {
  return (
    <tr>
      <td>{file.name}</td>
      <td>{byteToHumanSizeString(parseInt(file.size))}</td>
      <td>
        <Group position="right">
          <ActionIcon
            aria-label={`Download ${file.name} via admin audit`}
            color="victoria"
            variant="light"
            onClick={() =>
              shareService.downloadAdminAuditFile(shareId, file.id)
            }
          >
            <TbDownload />
          </ActionIcon>
        </Group>
      </td>
    </tr>
  );
};

export default showShareAuditModal;
