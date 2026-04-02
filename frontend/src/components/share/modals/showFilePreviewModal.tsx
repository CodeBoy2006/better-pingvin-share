import { ModalsContextProps } from "@mantine/modals/lib/context";
import { FileMetaData } from "../../../types/File.type";
import FilePreview from "../FilePreview";

const showFilePreviewModal = (
  shareId: string,
  file: FileMetaData,
  modals: ModalsContextProps,
) => {
  return modals.openModal({
    size: "80%",
    title: file.name,
    children: <FilePreview shareId={shareId} file={file} />,
  });
};

export default showFilePreviewModal;
