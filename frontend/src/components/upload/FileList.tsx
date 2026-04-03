import { ActionIcon, Group } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { TbEdit, TbTrash } from "react-icons/tb";
import { GrUndo } from "react-icons/gr";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { FileListItem } from "../../types/File.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import UploadProgressIndicator from "./UploadProgressIndicator";
import { FormattedMessage } from "react-intl";
import showTextEditorModal from "./modals/showTextEditorModal";
import { Table } from "@mantine/core";

const FileListRow = ({
  file,
  onRemove,
  onRestore,
  onEdit,
}: {
  file: FileListItem;
  onRemove?: () => void;
  onRestore?: () => void;
  onEdit?: () => void;
}) => {
  {
    const uploadable = "uploadingProgress" in file;
    const uploading = uploadable && file.uploadingProgress !== 0;
    const removable = uploadable
      ? file.uploadingProgress === 0
      : onRemove && !file.deleted;
    const restorable = onRestore && !uploadable && !!file.deleted; // maybe undefined, force boolean
    const deleted = !uploadable && !!file.deleted;
    const editable =
      uploadable &&
      file.uploadingProgress === 0 &&
      shareService.isShareTextFile(file.name);
    const t = useTranslate();

    return (
      <tr
        style={{
          color: deleted ? "rgba(120, 120, 120, 0.5)" : "inherit",
          textDecoration: deleted ? "line-through" : "none",
        }}
      >
        <td>{file.name}</td>
        <td>{byteToHumanSizeString(+file.size)}</td>
        <td>
          <Group position="right" spacing="xs" noWrap>
            {editable && (
              <ActionIcon
                color="blue"
                variant="light"
                size={25}
                aria-label={t("common.button.edit")}
                title={t("common.button.edit")}
                onClick={onEdit}
              >
                <TbEdit />
              </ActionIcon>
            )}
            {removable && (
              <ActionIcon
                aria-label={t("common.button.delete")}
                color="red"
                variant="light"
                size={25}
                title={t("common.button.delete")}
                onClick={onRemove}
              >
                <TbTrash />
              </ActionIcon>
            )}
            {uploading && (
              <UploadProgressIndicator progress={file.uploadingProgress} />
            )}
            {restorable && (
              <ActionIcon
                aria-label={t("common.button.undo")}
                color="primary"
                variant="light"
                size={25}
                title={t("common.button.undo")}
                onClick={onRestore}
              >
                <GrUndo />
              </ActionIcon>
            )}
          </Group>
        </td>
      </tr>
    );
  }
};

const FileList = <T extends FileListItem = FileListItem>({
  files,
  setFiles,
}: {
  files: T[];
  setFiles: (files: T[]) => void;
}) => {
  const modals = useModals();
  const remove = (index: number) => {
    const file = files[index];

    if ("uploadingProgress" in file) {
      files.splice(index, 1);
    } else {
      files[index] = { ...file, deleted: true };
    }

    setFiles([...files]);
  };

  const restore = (index: number) => {
    const file = files[index];

    if ("uploadingProgress" in file) {
      return;
    } else {
      files[index] = { ...file, deleted: false };
    }

    setFiles([...files]);
  };

  const edit = async (index: number) => {
    const originalFile = files[index] as unknown as File;
    const text = await originalFile.text();

    showTextEditorModal(index, files, setFiles, text, modals);
  };

  const rows = files.map((file, i) => (
    <FileListRow
      key={i}
      file={file}
      onRemove={() => remove(i)}
      onRestore={() => restore(i)}
      onEdit={() => void edit(i)}
    />
  ));

  return (
    <Table>
      <thead>
        <tr>
          <th>
            <FormattedMessage id="upload.filelist.name" />
          </th>
          <th>
            <FormattedMessage id="upload.filelist.size" />
          </th>
          <th></th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </Table>
  );
};

export default FileList;
