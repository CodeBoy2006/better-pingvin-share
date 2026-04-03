import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import {
  ALL_API_TOKEN_SCOPES,
  buildCreateApiTokenDto,
} from "../../fixtures/apiToken.fixture";
import { createIntegrationApp } from "../../fixtures/test-app.fixture";

describe("ApiTokenController", () => {
  let fixture: Awaited<ReturnType<typeof createIntegrationApp>>;

  beforeAll(async () => {
    fixture = await createIntegrationApp();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.close();
    }
  });

  it("requires a signed-in session to manage API tokens", async () => {
    const response = await fixture.request.get("/api/v1/tokens");

    expect(response.status).toBe(401);
  });

  it("creates, lists, and revokes API tokens for the current user", async () => {
    const session = await fixture.createSession({
      username: "api-token-owner",
      email: "api-token-owner@test.local",
    });

    const createResponse = await session.agent
      .post("/api/v1/tokens")
      .send(
        buildCreateApiTokenDto({
          name: "CLI token",
          scopes: ALL_API_TOKEN_SCOPES,
        }),
      );

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "CLI token",
        scopes: expect.arrayContaining(ALL_API_TOKEN_SCOPES),
        token: expect.stringMatching(/^psk_[^.]+\.[A-Za-z0-9_-]+$/),
      }),
    );

    const listResponse = await session.agent.get("/api/v1/tokens");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: createResponse.body.id,
        name: "CLI token",
        scopes: expect.arrayContaining(ALL_API_TOKEN_SCOPES),
      }),
    ]);
    expect(listResponse.body[0].token).toBeUndefined();

    const revokeResponse = await session.agent.delete(
      `/api/v1/tokens/${createResponse.body.id}`,
    );

    expect(revokeResponse.status).toBe(204);

    const listAfterRevoke = await session.agent.get("/api/v1/tokens");

    expect(listAfterRevoke.status).toBe(200);
    expect(listAfterRevoke.body[0].revokedAt).toEqual(expect.any(String));
  });
});
