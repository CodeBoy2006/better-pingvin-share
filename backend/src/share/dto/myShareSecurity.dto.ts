import { Expose } from "class-transformer";

export class MyShareSecurityDTO {
  @Expose()
  passwordProtected: boolean;

  @Expose()
  maxViews?: number;

  @Expose()
  maxIps?: number;

  @Expose()
  allowedIps?: string[];

  @Expose()
  assignedIps?: string[];
}
