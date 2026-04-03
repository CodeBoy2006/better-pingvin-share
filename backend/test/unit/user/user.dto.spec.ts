import { UserDTO } from "src/user/dto/user.dto";
import { buildUserEntity } from "../../fixtures/user.fixture";

describe("UserDTO", () => {
  it("serializes only exposed fields and marks LDAP users", () => {
    const dto = new UserDTO().from(
      buildUserEntity({
        ldapDN: "cn=user,dc=example,dc=com",
        password: "hashed-password",
      }),
    );

    expect(dto).toEqual({
      email: expect.any(String),
      hasPassword: undefined,
      id: expect.any(String),
      isAdmin: false,
      isLdap: true,
      totpVerified: false,
      username: expect.any(String),
    });
    expect("ldapDN" in dto).toBe(false);
    expect("password" in dto).toBe(false);
  });

  it("maps user lists through the same serializer", () => {
    const dto = new UserDTO();
    const users = [
      buildUserEntity({
        ldapDN: null,
      }),
      buildUserEntity({
        ldapDN: "cn=user,dc=example,dc=com",
      }),
    ];

    expect(dto.fromList(users)).toEqual([
      expect.objectContaining({ isLdap: false }),
      expect.objectContaining({ isLdap: true }),
    ]);
  });
});
