import type { ReactNode } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import toast from "../../utils/toast.util";
import Dropzone from "./Dropzone";
import FileList from "./FileList";
import TextEditor from "./TextEditor";
import showTextEditorModal from "./modals/showTextEditorModal";

type MockDropzoneProps = {
  children: ReactNode;
  onDrop: (files: File[]) => void;
  openRef?: { current?: () => void };
};

let dropzoneProps: MockDropzoneProps | undefined;
const openDialog = vi.fn();

vi.mock("@mantine/dropzone", () => ({
  Dropzone: (props: MockDropzoneProps) => {
    dropzoneProps = props;
    if (props.openRef) {
      props.openRef.current = openDialog;
    }

    return <div data-testid="mantine-dropzone">{props.children}</div>;
  },
}));

vi.mock("./modals/showTextEditorModal", () => ({
  default: vi.fn(),
}));

vi.mock("../../utils/toast.util", () => ({
  default: {
    axiosError: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const createUploadFile = (name: string, contents = "hello") => {
  const file = new File([contents], name, {
    type: "text/plain",
  }) as File & {
    text: () => Promise<string>;
    uploadingProgress: number;
  };

  file.uploadingProgress = 0;
  file.text = vi.fn().mockResolvedValue(contents);

  return file;
};

describe("upload components", () => {
  beforeEach(() => {
    dropzoneProps = undefined;
    openDialog.mockReset();
  });

  it("opens the file picker and forwards accepted files with upload metadata", async () => {
    const user = userEvent.setup();
    const onFilesChanged = vi.fn();
    const file = createUploadFile("notes.txt");

    renderWithProviders(
      <Dropzone
        isUploading={false}
        maxShareSize={1024}
        onFilesChanged={onFilesChanged}
      />,
    );

    await user.click(screen.getByRole("button", { name: /upload files/i }));

    expect(openDialog).toHaveBeenCalled();

    await act(async () => {
      dropzoneProps?.onDrop([file]);
    });

    expect(onFilesChanged).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "notes.txt",
        uploadingProgress: 0,
      }),
    ]);
  });

  it("rejects files that exceed the max share size", async () => {
    const onFilesChanged = vi.fn();
    const file = createUploadFile("large.txt", "1234");

    renderWithProviders(
      <Dropzone isUploading={false} maxShareSize={1} onFilesChanged={onFilesChanged} />,
    );

    await act(async () => {
      dropzoneProps?.onDrop([file]);
    });

    expect(toast.error).toHaveBeenCalled();
    expect(onFilesChanged).not.toHaveBeenCalled();
  });

  it("allows editing, removing, and restoring files in the upload list", async () => {
    const user = userEvent.setup();
    const setFiles = vi.fn();
    const editableFile = createUploadFile("draft.txt", "draft");
    const deletedFile = {
      deleted: true,
      id: "saved-file",
      name: "archive.txt",
      size: "12",
    };

    const { rerender } = renderWithProviders(
      <FileList files={[editableFile]} setFiles={setFiles} />,
    );

    await user.click(screen.getByRole("button", { name: /edit/i }));

    await waitFor(() => {
      expect(showTextEditorModal).toHaveBeenCalledWith(
        0,
        expect.any(Array),
        setFiles,
        "draft",
        expect.any(Object),
      );
    });

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(setFiles).toHaveBeenCalledWith([]);

    rerender(<FileList files={[deletedFile]} setFiles={setFiles} />);

    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(setFiles).toHaveBeenCalledWith([
      expect.objectContaining({
        deleted: false,
        id: "saved-file",
      }),
    ]);
  });

  it("saves edited text and supports cancelling changes", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSave = vi.fn();

    renderWithProviders(
      <TextEditor initialText="first draft" onCancel={onCancel} onSave={onSave} />,
    );

    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "final draft");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith("final draft");

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });
});
