import { ALL_API_TOKEN_SCOPES } from "./apiToken.fixture";
import type { IntegrationAppFixture } from "./test-app.fixture";

export async function createApiV1Context(
  fixture: IntegrationAppFixture,
  overrides: Partial<{
    email: string;
    username: string;
    password: string;
    isAdmin: boolean;
    totpVerified: boolean;
    ldapDN: string | null;
    scopes: string[];
  }> = {},
) {
  const session = await fixture.createSession(overrides);
  const token = await fixture.createApiToken({
    userId: session.user.id,
    name: "Automation token",
    scopes: overrides.scopes ?? ALL_API_TOKEN_SCOPES,
  });

  return {
    ...session,
    apiToken: token.token as string,
    authorization: `Bearer ${token.token}`,
  };
}
