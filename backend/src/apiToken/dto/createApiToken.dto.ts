import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { API_TOKEN_SCOPES } from "../apiToken.constants";

export class CreateApiTokenDTO {
  @IsString()
  @Length(1, 64)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(API_TOKEN_SCOPES, { each: true })
  scopes: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
