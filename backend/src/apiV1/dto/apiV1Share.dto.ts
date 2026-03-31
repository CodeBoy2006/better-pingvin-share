import { Expose, plainToClass, Type } from "class-transformer";
import { FileDTO } from "src/file/dto/file.dto";

class ApiV1ShareSecurityDTO {
  @Expose()
  passwordProtected: boolean;

  @Expose()
  maxViews?: number;
}

export class ApiV1ShareDTO {
  @Expose()
  id: string;

  @Expose()
  name?: string;

  @Expose()
  createdAt: Date;

  @Expose()
  expiration: Date;

  @Expose()
  description?: string;

  @Expose()
  views: number;

  @Expose()
  uploadLocked: boolean;

  @Expose()
  isZipReady: boolean;

  @Expose()
  size: number;

  @Expose()
  recipients: string[];

  @Expose()
  @Type(() => FileDTO)
  files: {
    createdAt: Date;
    id: string;
    name: string;
    shareId: string;
    size: string;
  }[];

  @Expose()
  @Type(() => ApiV1ShareSecurityDTO)
  security?: ApiV1ShareSecurityDTO;

  from(partial: Partial<ApiV1ShareDTO>) {
    return plainToClass(ApiV1ShareDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<ApiV1ShareDTO>[]) {
    return partial.map((part) => this.from(part));
  }
}
