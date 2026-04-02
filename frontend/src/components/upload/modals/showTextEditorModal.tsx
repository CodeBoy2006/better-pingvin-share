import { ModalsContextProps } from "@mantine/modals/lib/context";
import mime from "mime-types";
import { FileListItem, FileUpload } from "../../../types/File.type";
import TextEditor from "../TextEditor";

const showTextEditorModal = <T extends FileListItem>(
  index: number,
  files: T[],
  setFiles: (files: T[]) => void,
  text: string,
  modals: ModalsContextProps,
) => {
  const originalFile = files[index] as unknown as File;
  const mimeType =
    originalFile.type || mime.contentType(originalFile.name) || "text/plain";

  modals.openModal({
    title: originalFile.name,
    size: "xl",
    children: (
      <TextEditor
        initialText={text}
        onCancel={() => modals.closeAll()}
        onSave={(nextText) => {
          const nextFile = new File([nextText], originalFile.name, {
            type: mimeType.toString(),
          });

          const nextUpload = nextFile as FileUpload;
          nextUpload.uploadingProgress = 0;

          const nextFiles = [...files];
          nextFiles[index] = nextUpload as unknown as T;
          setFiles(nextFiles);
          modals.closeAll();
        }}
      />
    ),
  });
};

export default showTextEditorModal;
