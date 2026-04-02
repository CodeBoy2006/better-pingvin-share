import {
  ActionIcon,
  Box,
  Group,
  MediaQuery,
  Skeleton,
  Table,
  Text,
} from "@mantine/core";
import { useModals } from "@mantine/modals";
import moment from "moment";
import { TbLink, TbTrash } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useConfig from "../../../hooks/config.hook";
import { MyShare } from "../../../types/share.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import showShareLinkModal from "../../account/showShareLinkModal";

const ManageShareTable = ({
  shares,
  deleteShare,
  isLoading,
}: {
  shares: MyShare[];
  deleteShare: (share: MyShare) => void;
  isLoading: boolean;
}) => {
  const modals = useModals();
  const config = useConfig();
  const fileRetentionPeriod = config.get("share.fileRetentionPeriod");
  const showDeletesOnColumn = fileRetentionPeriod.value > 0;

  return (
    <Box sx={{ display: "block", overflowX: "auto" }}>
      <Table verticalSpacing="sm">
        <thead>
          <tr>
            <th>
              <FormattedMessage id="account.shares.table.id" />
            </th>
            <th>
              <FormattedMessage id="account.shares.table.name" />
            </th>
            <th>
              <FormattedMessage id="admin.shares.table.username" />
            </th>
            <th>
              <FormattedMessage id="account.shares.table.visitors" />
            </th>
            <th>
              <FormattedMessage id="account.shares.table.size" />
            </th>
            <th>
              <FormattedMessage id="account.shares.table.expiresAt" />
            </th>
            {showDeletesOnColumn && (
              <th>
                <FormattedMessage id="admin.shares.table.deletes" />
              </th>
            )}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? getSkeletonRows(showDeletesOnColumn)
            : shares.map((share) => (
                <tr key={share.id}>
                  <td>{share.id}</td>
                  <td>{share.name}</td>
                  <td>
                    {share.creator ? (
                      share.creator.username
                    ) : (
                      <Text color="dimmed">Anonymous</Text>
                    )}
                  </td>
                  <td>{share.views}</td>
                  <td>{byteToHumanSizeString(share.size)}</td>
                  <td>
                    {moment(share.expiration).unix() === 0
                      ? "Never"
                      : moment(share.expiration).format("LLL")}
                  </td>
                  {showDeletesOnColumn && (
                    <td>
                      {moment(share.expiration).unix() === 0
                        ? "Never"
                        : moment(share.expiration)
                            .add(
                              fileRetentionPeriod.value,
                              fileRetentionPeriod.unit,
                            )
                            .format("LLL")}
                    </td>
                  )}
                  <td>
                    <Group position="right">
                      <ActionIcon
                        color="victoria"
                        variant="light"
                        size={25}
                        onClick={() => showShareLinkModal(modals, share.id)}
                      >
                        <TbLink />
                      </ActionIcon>
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="sm"
                        onClick={() => deleteShare(share)}
                      >
                        <TbTrash />
                      </ActionIcon>
                    </Group>
                  </td>
                </tr>
              ))}
        </tbody>
      </Table>
    </Box>
  );
};

const getSkeletonRows = (showDeletesOnColumn: boolean) =>
  [...Array(10)].map((v, i) => (
  <tr key={i}>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <MediaQuery smallerThan="md" styles={{ display: "none" }}>
      <td>
        <Skeleton key={i} height={20} />
      </td>
    </MediaQuery>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    {showDeletesOnColumn && (
      <td>
        <Skeleton key={`${i}-delete`} height={20} />
      </td>
    )}
  </tr>
  ));

export default ManageShareTable;
