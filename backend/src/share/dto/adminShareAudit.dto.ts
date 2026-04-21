import { Expose, plainToClass, Type } from "class-transformer";
import { FileDTO } from "src/file/dto/file.dto";
import { PublicUserDTO } from "src/user/dto/publicUser.dto";

export class AdminShareAuditDTO {
  @Expose()
  id: string;

  @Expose()
  name?: string;

  @Expose()
  description?: string;

  @Expose()
  createdAt: Date;

  @Expose()
  expiration: Date;

  @Expose()
  uploadLocked: boolean;

  @Expose()
  views: number;

  @Expose()
  size: number;

  @Expose()
  storageProvider: string;

  @Expose()
  @Type(() => FileDTO)
  files: FileDTO[];

  @Expose()
  @Type(() => PublicUserDTO)
  creator?: PublicUserDTO;

  from(
    partial: Partial<Omit<AdminShareAuditDTO, "creator" | "files">> & {
      creator?: Partial<PublicUserDTO>;
      files?: Partial<FileDTO>[];
    },
  ) {
    return plainToClass(AdminShareAuditDTO, partial, {
      excludeExtraneousValues: true,
    });
  }
}
