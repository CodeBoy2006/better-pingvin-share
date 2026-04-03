import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IntegrationAppFixture } from "./test-app.fixture";

export function buildChunkUploadQuery(
  overrides: Partial<{
    id: string;
    name: string;
    chunkIndex: string;
    totalChunks: string;
  }> = {},
) {
  return {
    id: overrides.id ?? randomUUID(),
    name: overrides.name ?? "fixture-file.txt",
    chunkIndex: overrides.chunkIndex ?? "0",
    totalChunks: overrides.totalChunks ?? "1",
  };
}

export async function seedStoredFile(
  fixture: IntegrationAppFixture,
  input: {
    shareId: string;
    id?: string;
    name?: string;
    contents?: Buffer | string;
  },
) {
  const fileId = input.id ?? randomUUID();
  const fileName = input.name ?? "fixture-file.txt";
  const contents =
    typeof input.contents === "string"
      ? Buffer.from(input.contents)
      : input.contents ?? Buffer.from("Batch C fixture file");

  fixture.createShareDirectory(input.shareId);

  const filePath = path.join(fixture.runtime.shareDir, input.shareId, fileId);
  fs.writeFileSync(filePath, contents);

  return fixture.prisma.file.create({
    data: {
      id: fileId,
      name: fileName,
      size: contents.byteLength.toString(),
      shareId: input.shareId,
    },
  });
}

export function binaryResponseParser(
  response: any,
  callback: (error: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];

  response.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  response.on("end", () => {
    callback(null, Buffer.concat(chunks));
  });
  response.on("error", (error) => {
    callback(error, Buffer.alloc(0));
  });
}
