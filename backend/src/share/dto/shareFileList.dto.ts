import { Expose, plainToClass, Type } from "class-transformer";

class ShareFileListEntryDTO {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  sizeBytes: string;

  @Expose()
  createdAt: Date;

  @Expose()
  contentType: string;

  @Expose()
  downloadUrl: string;

  @Expose()
  inlineUrl: string;

  @Expose()
  webViewUrl?: string;
}

class ShareFileListShareDTO {
  @Expose()
  id: string;

  @Expose()
  name?: string;

  @Expose()
  description?: string;

  @Expose()
  expiration: Date;

  @Expose()
  hasPassword: boolean;

  @Expose()
  isZipReady: boolean;

  @Expose()
  totalFiles: number;

  @Expose()
  totalSizeBytes: string;

  @Expose()
  url: string;

  @Expose()
  machineReadableUrl: string;

  @Expose()
  plainTextUrl: string;

  @Expose()
  zipDownloadUrl?: string;
}

export class ShareFileListDTO {
  @Expose()
  type: string;

  @Expose()
  version: number;

  @Expose()
  @Type(() => ShareFileListShareDTO)
  share: ShareFileListShareDTO;

  @Expose()
  @Type(() => ShareFileListEntryDTO)
  files: ShareFileListEntryDTO[];

  from(partial: Partial<ShareFileListDTO>) {
    return plainToClass(ShareFileListDTO, partial, {
      excludeExtraneousValues: true,
    });
  }
}
