import { Expose, plainToClass } from "class-transformer";
import { ApiTokenScope } from "../apiToken.constants";

export class ApiTokenDTO {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  scopes: ApiTokenScope[];

  @Expose()
  createdAt: Date;

  @Expose()
  expiresAt?: Date;

  @Expose()
  lastUsedAt?: Date;

  @Expose()
  lastUsedIp?: string;

  @Expose()
  revokedAt?: Date;

  from(partial: Partial<ApiTokenDTO>) {
    return plainToClass(ApiTokenDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<ApiTokenDTO>[]) {
    return partial.map((part) => this.from(part));
  }
}
