import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiTokenScope } from "../apiToken.constants";
import { API_TOKEN_SCOPES_KEY } from "../decorator/apiScopes.decorator";
import { ApiPrincipalType } from "../apiToken.types";

@Injectable()
export class ApiScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredScopes = this.reflector.getAllAndOverride<ApiTokenScope[]>(
      API_TOKEN_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      apiPrincipal?: ApiPrincipalType;
    }>();

    const principal = request.apiPrincipal;

    if (!principal) {
      throw new ForbiddenException("API scopes unavailable");
    }

    const hasRequiredScopes = requiredScopes.every((scope) =>
      principal.scopes.includes(scope),
    );

    if (!hasRequiredScopes) {
      throw new ForbiddenException("API token scope insufficient");
    }

    return true;
  }
}
