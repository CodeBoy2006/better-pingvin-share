import { Transform, Type } from "class-transformer";
import {
  ArrayUnique,
  IsEmail,
  IsArray,
  IsIP,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class UpdateShareSecurityDTO {
  @ValidateIf(
    (_, value) => value !== undefined && value !== null && value !== "",
  )
  @IsString()
  @Length(3, 30)
  @IsOptional()
  password?: string;

  @IsNumber()
  @IsOptional()
  maxViews?: number;

  @IsNumber()
  @IsOptional()
  maxIps?: number;

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
  allowedIps?: string[];
}

export class UpdateShareDTO {
  @ValidateIf((_, value) => value !== "")
  @Length(3, 30)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  expiration?: string;

  @MaxLength(512)
  @IsOptional()
  description?: string;

  @IsEmail({}, { each: true })
  @IsOptional()
  recipients?: string[];

  @ValidateNested()
  @IsOptional()
  @Type(() => UpdateShareSecurityDTO)
  security?: UpdateShareSecurityDTO;
}
