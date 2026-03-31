import { Expose, plainToClass } from "class-transformer";
import { ApiTokenDTO } from "./apiToken.dto";

export class CreatedApiTokenDTO extends ApiTokenDTO {
  @Expose()
  token: string;

  from(partial: Partial<CreatedApiTokenDTO>) {
    return plainToClass(CreatedApiTokenDTO, partial, {
      excludeExtraneousValues: true,
    });
  }
}
