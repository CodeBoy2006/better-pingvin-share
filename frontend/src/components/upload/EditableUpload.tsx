import { Button, Group } from "@mantine/core";
import { cleanNotifications } from "@mantine/notifications";
import { useRouter } from "next/router";
import pLimit from "p-limit";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import Dropzone from "../../components/upload/Dropzone";
import FileList from "../../components/upload/FileList";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { FileListItem, FileMetaData, FileUpload } from "../../types/File.type";
import toast from "../../utils/toast.util";
import {
  getUnexpectedChunkIndex,
  getUploadErrorMessage,
  isPermanentUploadError,
} from "../../utils/upload.util";

const promiseLimit = pLimit(3);
let uploadNotificationType: "retry" | "permanent" | null = null;

const EditableUpload = ({
  maxShareSize,
  shareId,
  files: savedFiles = [],
}: {
  maxShareSize?: number;
  isReverseShare?: boolean;
  shareId: string;
  files?: FileMetaData[];
}) => {
  const t = useTranslate();
  const router = useRouter();
  const config = useConfig();

  const chunkSize = useRef(parseInt(config.get("share.chunkSize")));

  const [existingFiles, setExistingFiles] =
    useState<Array<FileMetaData & { deleted?: boolean }>>(savedFiles);
  const [uploadingFiles, setUploadingFiles] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const existingAndUploadedFiles: FileListItem[] = useMemo(
    () => [...uploadingFiles, ...existingFiles],
    [existingFiles, uploadingFiles],
  );
  const dirty = useMemo(() => {
    return (
      existingFiles.some((file) => !!file.deleted) || !!uploadingFiles.length
    );
  }, [existingFiles, uploadingFiles]);

  const setFiles = (files: FileListItem[]) => {
    const _uploadFiles = files.filter(
      (file) => "uploadingProgress" in file,
    ) as FileUpload[];
    const _existingFiles = files.filter(
      (file) => !("uploadingProgress" in file),
    ) as FileMetaData[];

    setUploadingFiles(_uploadFiles);
    setExistingFiles(_existingFiles);
  };

  maxShareSize ??= parseInt(config.get("share.maxSize"));

  const uploadFiles = async (files: FileUpload[]) => {
    const fileUploadPromises = files.map(async (file, fileIndex) =>
      // Limit the number of concurrent uploads to 3
      promiseLimit(async () => {
        let fileId: string | undefined;

        const updateFileState = (updates: Partial<FileUpload>) => {
          setUploadingFiles((files) =>
            files.map((file, callbackIndex) => {
              if (fileIndex == callbackIndex) {
                Object.assign(file, updates);
              }
              return file;
            }),
          );
        };

        updateFileState({ uploadingProgress: 1, uploadError: undefined });

        let chunks = Math.ceil(file.size / chunkSize.current);

        // If the file is 0 bytes, we still need to upload 1 chunk
        if (chunks == 0) chunks++;

        for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
          const from = chunkIndex * chunkSize.current;
          const to = from + chunkSize.current;
          const blob = file.slice(from, to);
          try {
            await shareService
              .uploadFile(
                shareId,
                blob,
                {
                  id: fileId,
                  name: file.name,
                },
                chunkIndex,
                chunks,
              )
              .then((response) => {
                fileId = response.id;
              });

            updateFileState({
              uploadingProgress: ((chunkIndex + 1) / chunks) * 100,
              uploadError: undefined,
            });
          } catch (e) {
            const expectedChunkIndex = getUnexpectedChunkIndex(e);
            if (expectedChunkIndex != undefined) {
              // Retry with the expected chunk index
              chunkIndex = expectedChunkIndex - 1;
              continue;
            }

            if (isPermanentUploadError(e)) {
              updateFileState({
                uploadingProgress: -1,
                uploadError: getUploadErrorMessage(e),
              });
              return false;
            }

            updateFileState({ uploadingProgress: -1, uploadError: undefined });
            // Retry after 5 seconds
            await new Promise((resolve) => setTimeout(resolve, 5000));
            updateFileState({ uploadingProgress: 1, uploadError: undefined });
            chunkIndex = -1;
          }
        }

        return true;
      }),
    );

    const uploadResults = await Promise.all(fileUploadPromises);
    return uploadResults.every(Boolean);
  };

  const removeFiles = async () => {
    const removedFiles = existingFiles.filter((file) => !!file.deleted);

    if (removedFiles.length > 0) {
      await Promise.all(
        removedFiles.map(async (file) => {
          await shareService.removeFile(shareId, file.id);
        }),
      );

      setExistingFiles(existingFiles.filter((file) => !file.deleted));
    }
  };

  const revertComplete = async () => {
    await shareService.revertComplete(shareId).then();
  };

  const completeShare = async () => {
    return await shareService.completeShare(shareId);
  };

  const save = async () => {
    setIsUploading(true);

    try {
      await revertComplete();
      const uploadSucceeded = await uploadFiles(uploadingFiles);

      if (!uploadSucceeded) {
        return;
      }

      await removeFiles();
      await completeShare();

      toast.success(t("share.edit.notify.save-success"));
      router.back();
    } catch {
      toast.error(t("share.edit.notify.generic-error"));
    } finally {
      setIsUploading(false);
    }
  };

  const appendFiles = (appendingFiles: FileUpload[]) => {
    setUploadingFiles([...appendingFiles, ...uploadingFiles]);
  };

  useEffect(() => {
    const transientErrorCount = uploadingFiles.filter(
      (file) => file.uploadingProgress == -1 && !file.uploadError,
    ).length;
    const permanentErrorFiles = uploadingFiles.filter(
      (file) => file.uploadingProgress == -1 && !!file.uploadError,
    );
    const permanentErrorCount = permanentErrorFiles.length;

    if (permanentErrorCount > 0) {
      if (uploadNotificationType !== "permanent") {
        cleanNotifications();
        toast.error(
          permanentErrorCount === 1
            ? permanentErrorFiles[0].uploadError!
            : t("upload.notify.count-permanently-failed", {
                count: permanentErrorCount,
              }),
          {
            withCloseButton: false,
            autoClose: false,
          },
        );
      }
      uploadNotificationType = "permanent";
    } else if (transientErrorCount > 0) {
      if (uploadNotificationType !== "retry") {
        cleanNotifications();
        toast.error(
          t("upload.notify.count-failed", { count: transientErrorCount }),
          {
            withCloseButton: false,
            autoClose: false,
          },
        );
      }
      uploadNotificationType = "retry";
    } else {
      cleanNotifications();
      uploadNotificationType = null;
    }
  }, [uploadingFiles]);

  return (
    <>
      <Group position="right" mb={20}>
        <Button loading={isUploading} disabled={!dirty} onClick={() => save()}>
          <FormattedMessage id="share.edit.save-files" />
        </Button>
      </Group>
      <Dropzone
        title={t("share.edit.append-upload")}
        maxShareSize={maxShareSize}
        onFilesChanged={appendFiles}
        isUploading={isUploading}
      />
      {existingAndUploadedFiles.length > 0 && (
        <FileList files={existingAndUploadedFiles} setFiles={setFiles} />
      )}
    </>
  );
};
export default EditableUpload;
