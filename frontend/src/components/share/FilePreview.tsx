import {
  Button,
  Center,
  Loader,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { FormattedMessage } from "react-intl";
import api from "../../services/api.service";
import { FileMetaData } from "../../types/File.type";
import {
  canPreviewFileByName,
  decodePreviewText,
  detectTextPreviewDescriptor,
  FilePreviewDescriptor,
  guessFilePreviewDescriptor,
  isProbablyText,
  MAX_SNIFFABLE_PREVIEW_BYTES,
  MAX_TEXT_PREVIEW_BYTES,
  sniffBinaryPreviewDescriptor,
} from "../../utils/filePreview.util";
import { byteToHumanSizeString } from "../../utils/fileSize.util";

type ReadyPreviewState = {
  status: "ready";
  descriptor: FilePreviewDescriptor;
  text?: string;
  sourceUrl: string;
};

type PreviewState =
  | { status: "loading" }
  | { status: "tooLarge"; limitBytes: number }
  | { status: "error" }
  | ReadyPreviewState;

const FilePreview = ({
  shareId,
  file,
}: {
  shareId: string;
  file: FileMetaData;
}) => {
  const theme = useMantineTheme();
  const [previewState, setPreviewState] = useState<PreviewState>({
    status: "loading",
  });

  const sourceUrl = useMemo(
    () => `/api/shares/${shareId}/files/${file.id}?download=false`,
    [file.id, shareId],
  );

  useEffect(() => {
    const guessedDescriptor = guessFilePreviewDescriptor(file.name);
    const sizeBytes = parseInt(file.size);

    if (["image", "audio", "video", "pdf"].includes(guessedDescriptor.kind)) {
      setPreviewState({
        status: "ready",
        descriptor: guessedDescriptor,
        sourceUrl,
      });
      return;
    }

    const previewLimit =
      guessedDescriptor.kind === "unsupported"
        ? MAX_SNIFFABLE_PREVIEW_BYTES
        : MAX_TEXT_PREVIEW_BYTES;

    if (!canPreviewFileByName(file.name, sizeBytes)) {
      setPreviewState({ status: "tooLarge", limitBytes: previewLimit });
      return;
    }

    let objectUrl: string | undefined;
    let isMounted = true;

    void api
      .get<ArrayBuffer>(sourceUrl, {
        responseType: "arraybuffer",
      })
      .then((response) => {
        if (!isMounted) {
          return;
        }

        const bytes = new Uint8Array(response.data);
        const sniffedDescriptor = sniffBinaryPreviewDescriptor(bytes);

        if (sniffedDescriptor) {
          objectUrl = URL.createObjectURL(
            new Blob([bytes], {
              type:
                sniffedDescriptor.mimeType || "application/octet-stream",
            }),
          );
          setPreviewState({
            status: "ready",
            descriptor: sniffedDescriptor,
            sourceUrl: objectUrl,
          });
          return;
        }

        if (!isProbablyText(bytes)) {
          setPreviewState({ status: "error" });
          return;
        }

        const text = decodePreviewText(bytes);
        const descriptor = detectTextPreviewDescriptor(file.name, text);

        if (
          descriptor.kind === "unsupported" ||
          ["image", "audio", "video", "pdf"].includes(descriptor.kind)
        ) {
          setPreviewState({ status: "error" });
          return;
        }

        setPreviewState({
          status: "ready",
          descriptor,
          text,
          sourceUrl,
        });
      })
      .catch(() => {
        if (isMounted) {
          setPreviewState({ status: "error" });
        }
      });

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file.id, file.name, file.size, sourceUrl]);

  const syntaxStyle = theme.colorScheme === "dark" ? oneDark : oneLight;

  return (
    <Stack>
      {previewState.status === "loading" && <LoadingPreview />}
      {previewState.status === "tooLarge" && (
        <PreviewTooLarge limitBytes={previewState.limitBytes} />
      )}
      {previewState.status === "error" && <UnSupportedFile />}
      {previewState.status === "ready" && (
        <PreviewBody
          previewState={previewState}
          syntaxStyle={syntaxStyle}
          onPreviewError={() => setPreviewState({ status: "error" })}
        />
      )}
      <Button
        variant="subtle"
        component={Link}
        onClick={() => modals.closeAll()}
        target="_blank"
        href={sourceUrl}
      >
        <FormattedMessage id="share.modal.file-preview.view-original" />
      </Button>
    </Stack>
  );
};

const PreviewBody = ({
  previewState,
  syntaxStyle,
  onPreviewError,
}: {
  previewState: ReadyPreviewState;
  syntaxStyle: { [key: string]: React.CSSProperties };
  onPreviewError: () => void;
}) => {
  switch (previewState.descriptor.kind) {
    case "pdf":
      return <PdfPreview sourceUrl={previewState.sourceUrl} />;
    case "video":
      return (
        <VideoPreview
          sourceUrl={previewState.sourceUrl}
          mimeType={previewState.descriptor.mimeType}
          onError={onPreviewError}
        />
      );
    case "image":
      return (
        <ImagePreview
          sourceUrl={previewState.sourceUrl}
          onError={onPreviewError}
        />
      );
    case "audio":
      return (
        <AudioPreview
          sourceUrl={previewState.sourceUrl}
          mimeType={previewState.descriptor.mimeType}
          onError={onPreviewError}
        />
      );
    case "markdown":
      return (
        <MarkdownPreview text={previewState.text || ""} syntaxStyle={syntaxStyle} />
      );
    case "code":
      return (
        <CodePreview
          text={previewState.text || ""}
          language={previewState.descriptor.language}
          syntaxStyle={syntaxStyle}
        />
      );
    case "text":
      return <PlainTextPreview text={previewState.text || ""} />;
    default:
      return <UnSupportedFile />;
  }
};

const LoadingPreview = () => {
  return (
    <Center style={{ minHeight: 240 }}>
      <Stack align="center" spacing="sm">
        <Loader />
        <Text>
          <FormattedMessage id="share.modal.file-preview.loading" />
        </Text>
      </Stack>
    </Center>
  );
};

const PreviewTooLarge = ({ limitBytes }: { limitBytes: number }) => {
  return (
    <Center style={{ minHeight: 240 }}>
      <Stack align="center" spacing={10}>
        <Title order={3}>
          <FormattedMessage id="share.modal.file-preview.error.not-supported.title" />
        </Title>
        <Text align="center">
          <FormattedMessage
            id="share.modal.file-preview.error.too-large.description"
            values={{ maxSize: byteToHumanSizeString(limitBytes) }}
          />
        </Text>
      </Stack>
    </Center>
  );
};

const AudioPreview = ({
  sourceUrl,
  mimeType,
  onError,
}: {
  sourceUrl: string;
  mimeType?: string;
  onError?: () => void;
}) => {
  return (
    <Center style={{ minHeight: 200 }}>
      <Stack align="center" spacing={10} style={{ width: "100%" }}>
        <audio controls style={{ width: "100%" }}>
          <source src={sourceUrl} type={mimeType} onError={onError} />
        </audio>
      </Stack>
    </Center>
  );
};

const VideoPreview = ({
  sourceUrl,
  mimeType,
  onError,
}: {
  sourceUrl: string;
  mimeType?: string;
  onError?: () => void;
}) => {
  return (
    <video width="100%" controls>
      <source src={sourceUrl} type={mimeType} onError={onError} />
    </video>
  );
};

const ImagePreview = ({
  sourceUrl,
  onError,
}: {
  sourceUrl: string;
  onError?: () => void;
}) => {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={sourceUrl} alt="preview" width="100%" onError={onError} />
  );
};

const MarkdownPreview = ({
  text,
  syntaxStyle,
}: {
  text: string;
  syntaxStyle: { [key: string]: React.CSSProperties };
}) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a({ href, children, ...props }) {
          return (
            <a {...props} href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
        code({ className, children, ...props }) {
          const language = className?.replace("language-", "");
          const isBlock = !!language;

          if (!isBlock) {
            return (
              <code {...props} className={className}>
                {children}
              </code>
            );
          }

          return (
            <SyntaxHighlighter
              style={syntaxStyle}
              language={language}
              PreTag="div"
              wrapLongLines
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          );
        },
        img({ src, alt, ...props }) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...props}
              src={src || ""}
              alt={alt || "markdown-preview-image"}
              style={{ maxWidth: "100%" }}
            />
          );
        },
        table({ children, ...props }) {
          return (
            <div style={{ overflowX: "auto" }}>
              <table {...props} className="md">
                {children}
              </table>
            </div>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
};

const CodePreview = ({
  text,
  language,
  syntaxStyle,
}: {
  text: string;
  language?: string;
  syntaxStyle: { [key: string]: React.CSSProperties };
}) => {
  return (
    <SyntaxHighlighter
      style={syntaxStyle}
      language={language}
      PreTag="div"
      wrapLongLines
    >
      {text}
    </SyntaxHighlighter>
  );
};

const PlainTextPreview = ({ text }: { text: string }) => {
  return (
    <Text
      component="pre"
      sx={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
    </Text>
  );
};

const PdfPreview = ({ sourceUrl }: { sourceUrl: string }) => {
  return (
    <iframe
      src={sourceUrl}
      style={{ width: "100%", minHeight: "75vh", border: 0 }}
      title="pdf-preview"
    />
  );
};

const UnSupportedFile = () => {
  return (
    <Center style={{ minHeight: 200 }}>
      <Stack align="center" spacing={10}>
        <Title order={3}>
          <FormattedMessage id="share.modal.file-preview.error.not-supported.title" />
        </Title>
        <Text align="center">
          <FormattedMessage id="share.modal.file-preview.error.not-supported.description" />
        </Text>
      </Stack>
    </Center>
  );
};

export default FilePreview;
