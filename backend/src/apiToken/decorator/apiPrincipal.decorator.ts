import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { ApiPrincipalType } from "../apiToken.types";

export const ApiPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext): ApiPrincipalType | undefined => {
    const request = context.switchToHttp().getRequest();
    return request.apiPrincipal;
  },
);
