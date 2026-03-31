import { Expose, plainToClass } from "class-transformer";
import { ApiTokenScope } from "src/apiToken/apiToken.constants";

export class ApiV1MeDTO {
  @Expose()
  id: string;

  @Expose()
  username: string;

  @Expose()
  email: string;

  @Expose()
  isAdmin: boolean;

  @Expose()
  isLdap: boolean;

  @Expose()
  hasPassword: boolean;

  @Expose()
  totpVerified: boolean;

  @Expose()
  tokenId: string;

  @Expose()
  scopes: ApiTokenScope[];

  from(partial: Partial<ApiV1MeDTO>) {
    return plainToClass(ApiV1MeDTO, partial, {
      excludeExtraneousValues: true,
    });
  }
}
