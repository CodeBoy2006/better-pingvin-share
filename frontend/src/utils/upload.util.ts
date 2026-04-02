const LOW_DISK_ERROR_MESSAGE = "Not enough space on the server";

type AxiosLikeError = {
  message?: string;
  response?: {
    status?: number;
    data?: {
      error?: string;
      expectedChunkIndex?: number;
      message?: string;
    };
  };
};

const getAxiosResponse = (error: unknown) => {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  return (error as AxiosLikeError).response;
};

export const getUnexpectedChunkIndex = (error: unknown) => {
  const response = getAxiosResponse(error);

  if (response?.data?.error === "unexpected_chunk_index") {
    return response.data.expectedChunkIndex as number;
  }

  return undefined;
};

export const isPermanentUploadError = (error: unknown) => {
  const response = getAxiosResponse(error);

  if (!response?.status) {
    return false;
  }

  const status = response.status;
  const message = response.data?.message;

  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return true;
  }

  return status === 500 && message === LOW_DISK_ERROR_MESSAGE;
};

export const getUploadErrorMessage = (error: unknown) => {
  const response = getAxiosResponse(error);

  if (response) {
    return response.data?.message ?? (error as AxiosLikeError).message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown error occurred";
};
