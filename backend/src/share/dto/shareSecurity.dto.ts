import { Transform } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsIP,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from "class-validator";

export class ShareSecurityDTO {
  @IsString()
  @IsOptional()
  @Length(3, 30)
  password: string;

  @IsNumber()
  @IsOptional()
  maxViews: number;

  @IsNumber()
  @IsOptional()
  maxIps: number;

  @IsArray()
  @ArrayUnique()
  @IsIP(undefined, { each: true })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === "string" ? item.trim() : item))
          .filter(Boolean)
      : value,
  )
  allowedIps: string[];
}
