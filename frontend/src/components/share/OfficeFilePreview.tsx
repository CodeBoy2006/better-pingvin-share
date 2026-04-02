import { Box, Center, Loader, Stack, Tabs, Text } from "@mantine/core";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import { OfficePreviewKind } from "../../utils/filePreview.util";

type OfficeFilePreviewProps = {
  kind: OfficePreviewKind;
  buffer: ArrayBuffer;
  onError: () => void;
};

type SpreadsheetSheetPreview = {
  id: string;
  name: string;
  srcDoc: string;
};

const previewFrameStyle: CSSProperties = {
  width: "100%",
  minHeight: "75vh",
  border: 0,
  borderRadius: 8,
  backgroundColor: "#fff",
};

const escapeHtml = (value: string) => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
};

const buildPreviewDocument = ({
  title,
  styles,
  body,
}: {
  title: string;
  styles: string;
  body: string;
}) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${styles}</style>
  </head>
  <body>${body}</body>
</html>`;

const spreadsheetDocumentStyles = `
  :root {
    color-scheme: light;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #1f2937;
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  body {
    padding: 16px;
  }
  table {
    border-collapse: collapse;
    max-width: 100%;
  }
  td, th {
    border: 1px solid #d0d7de;
    padding: 6px 10px;
    vertical-align: top;
  }
  th {
    background: #f6f8fa;
    font-weight: 600;
  }
`;

const presentationDocumentStyles = `
  :root {
    color-scheme: light;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #111827;
    color: #f9fafb;
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  body {
    padding: 24px 16px;
  }
  .pptx-preview-stack {
    display: flex;
    flex-direction: column;
    gap: 24px;
    align-items: center;
  }
  .pptx-preview-slide {
    width: 100%;
    max-width: 960px;
  }
`;

const docxDocumentStyles = `
  :root {
    color-scheme: light;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #f3f4f6;
    color: #111827;
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  body {
    padding: 16px;
  }
  .docx-wrapper {
    background: transparent !important;
    padding: 0 !important;
  }
`;

const OfficeFilePreview = ({
  kind,
  buffer,
  onError,
}: OfficeFilePreviewProps) => {
  switch (kind) {
    case "word":
      return <WordFilePreview buffer={buffer} onError={onError} />;
    case "spreadsheet":
      return <SpreadsheetFilePreview buffer={buffer} onError={onError} />;
    case "presentation":
      return <PresentationFilePreview buffer={buffer} onError={onError} />;
    default:
      return null;
  }
};

const WordFilePreview = ({
  buffer,
  onError,
}: {
  buffer: ArrayBuffer;
  onError: () => void;
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [ready, setReady] = useState(false);

  const srcDoc = useMemo(
    () =>
      buildPreviewDocument({
        title: "Word preview",
        styles: docxDocumentStyles,
        body: "<div id=\"docx-preview-root\"></div>",
      }),
    [],
  );

  useEffect(() => {
    if (!frameLoaded) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const iframe = iframeRef.current;
      const frameDocument = iframe?.contentDocument;
      const container = frameDocument?.getElementById("docx-preview-root");

      if (!frameDocument || !container) {
        throw new Error("DOCX preview frame is not ready");
      }

      const { renderAsync } = await import("docx-preview");

      container.innerHTML = "";

      await renderAsync(buffer.slice(0), container, frameDocument.head, {
        className: "docx",
        inWrapper: true,
        useBase64URL: true,
        renderAltChunks: false,
      });

      if (!cancelled) {
        setReady(true);
      }
    })().catch(() => {
      if (!cancelled) {
        onError();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [buffer, frameLoaded, onError]);

  return (
    <Stack spacing="sm">
      {!ready && <OfficePreviewLoading />}
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title="word-preview"
        sandbox="allow-same-origin"
        onLoad={() => setFrameLoaded(true)}
        style={{
          ...previewFrameStyle,
          display: ready ? "block" : "none",
        }}
      />
    </Stack>
  );
};

const SpreadsheetFilePreview = ({
  buffer,
  onError,
}: {
  buffer: ArrayBuffer;
  onError: () => void;
}) => {
  const [sheetPreviews, setSheetPreviews] = useState<SpreadsheetSheetPreview[]>(
    [],
  );
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer);
      const previews = workbook.SheetNames.map((sheetName, index) => ({
        id: `sheet-${index}`,
        name: sheetName,
        srcDoc: buildPreviewDocument({
          title: `${sheetName} preview`,
          styles: spreadsheetDocumentStyles,
          body: XLSX.utils.sheet_to_html(workbook.Sheets[sheetName]),
        }),
      }));

      if (!previews.length) {
        throw new Error("Spreadsheet has no previewable sheets");
      }

      if (!cancelled) {
        setSheetPreviews(previews);
        setActiveSheetId(previews[0].id);
      }
    })().catch(() => {
      if (!cancelled) {
        onError();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [buffer, onError]);

  if (!sheetPreviews.length) {
    return <OfficePreviewLoading />;
  }

  const activeSheet =
    sheetPreviews.find((sheetPreview) => sheetPreview.id === activeSheetId) ||
    sheetPreviews[0];

  return (
    <Stack spacing="sm">
      {sheetPreviews.length > 1 && (
        <Tabs value={activeSheet.id} onTabChange={setActiveSheetId}>
          <Box sx={{ overflowX: "auto" }}>
            <Tabs.List>
              {sheetPreviews.map((sheetPreview) => (
                <Tabs.Tab key={sheetPreview.id} value={sheetPreview.id}>
                  {sheetPreview.name}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Box>
        </Tabs>
      )}
      <iframe
        srcDoc={activeSheet.srcDoc}
        title={`spreadsheet-preview-${activeSheet.id}`}
        sandbox=""
        style={previewFrameStyle}
      />
    </Stack>
  );
};

const PresentationFilePreview = ({
  buffer,
  onError,
}: {
  buffer: ArrayBuffer;
  onError: () => void;
}) => {
  const [srcDoc, setSrcDoc] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { pptxToHtml } = await import("@jvmr/pptx-to-html");
      const slidesHtml = await pptxToHtml(buffer.slice(0), {
        width: 960,
        height: 540,
        scaleToFit: true,
        letterbox: true,
      });

      if (!slidesHtml.length) {
        throw new Error("Presentation has no previewable slides");
      }

      const body = `
        <div class="pptx-preview-stack">
          ${slidesHtml
            .map(
              (slideHtml) =>
                `<section class="pptx-preview-slide">${slideHtml}</section>`,
            )
            .join("")}
        </div>
      `;

      if (!cancelled) {
        setSrcDoc(
          buildPreviewDocument({
            title: "Presentation preview",
            styles: presentationDocumentStyles,
            body,
          }),
        );
      }
    })().catch(() => {
      if (!cancelled) {
        onError();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [buffer, onError]);

  if (!srcDoc) {
    return <OfficePreviewLoading />;
  }

  return (
    <iframe
      srcDoc={srcDoc}
      title="presentation-preview"
      sandbox=""
      style={previewFrameStyle}
    />
  );
};

const OfficePreviewLoading = () => {
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

export default OfficeFilePreview;
