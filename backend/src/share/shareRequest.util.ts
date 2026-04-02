import { Request } from "express";

export function getShareTokenFromRequest(request: Request, shareId: string) {
  const queryToken = request.query.token;

  if (typeof queryToken === "string" && queryToken.length > 0) {
    return queryToken;
  }

  const cookieToken = request.cookies?.[`share_${shareId}_token`];

  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }

  return undefined;
}
