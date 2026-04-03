import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

export const createUniqueConstraintError = (field: string) => {
  const error = Object.create(
    PrismaClientKnownRequestError.prototype,
  ) as PrismaClientKnownRequestError & {
    clientVersion: string;
    code: string;
    meta: {
      target: string[];
    };
  };

  error.clientVersion = "test";
  error.code = "P2002";
  error.meta = {
    target: [field],
  };

  return error;
};
