import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import {
  createConfig,
  createMyShare,
  createUser,
} from "../../../test/fixtures";
import { renderWithProviders } from "../../../test/render";

vi.mock("./users/showUpdateUserModal", () => ({
  default: vi.fn(),
}));

import AdminConfigInput from "./configuration/AdminConfigInput";
import ManageShareTable from "./shares/ManageShareTable";
import ManageUserTable from "./users/ManageUserTable";
import showUpdateUserModal from "./users/showUpdateUserModal";

describe("admin components", () => {
  it("renders local and ldap users with the correct row actions", async () => {
    const user = userEvent.setup();
    const deleteUser = vi.fn();
    const getUsers = vi.fn();

    renderWithProviders(
      <ManageUserTable
        deleteUser={deleteUser}
        getUsers={getUsers}
        isLoading={false}
        users={[
          createUser({
            id: "local-user",
            email: "local@example.com",
            username: "local",
          }),
          createUser({
            id: "ldap-user",
            email: "ldap@example.com",
            isLdap: true,
            username: "directory",
          }),
        ]}
      />,
    );

    const localRow = screen.getByRole("row", {
      name: /local local@example\.com/i,
    });
    const ldapRow = screen.getByRole("row", {
      name: /directory ldap ldap@example\.com/i,
    });

    await user.click(within(localRow).getByRole("button", { name: /edit/i }));
    await user.click(within(ldapRow).getByRole("button", { name: /delete/i }));

    expect(showUpdateUserModal).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: "local-user" }),
      getUsers,
    );
    expect(deleteUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ldap-user" }),
    );
    expect(
      within(ldapRow).queryByRole("button", { name: /edit/i }),
    ).not.toBeInTheDocument();
  });

  it("updates string config values through the admin config input", async () => {
    const user = userEvent.setup();
    const updateConfigVariable = vi.fn();

    renderWithProviders(
      <AdminConfigInput
        configVariable={createConfig({
          key: "general.appName",
          type: "string",
          value: "Pingvin Share",
        })}
        updateConfigVariable={updateConfigVariable}
      />,
    );

    const input = screen.getByRole("textbox");

    await user.clear(input);
    await user.type(input, "Better Pingvin Share");

    expect(updateConfigVariable).toHaveBeenLastCalledWith({
      key: "general.appName",
      value: "Better Pingvin Share",
    });
  });

  it("updates boolean config values through the admin config input", async () => {
    const user = userEvent.setup();
    const updateConfigVariable = vi.fn();

    renderWithProviders(
      <AdminConfigInput
        configVariable={createConfig({
          key: "smtp.enabled",
          type: "boolean",
          value: "false",
        })}
        updateConfigVariable={updateConfigVariable}
      />,
    );

    await user.click(screen.getByRole("checkbox"));

    expect(updateConfigVariable).toHaveBeenCalledWith({
      key: "smtp.enabled",
      value: true,
    });
  });

  it("renders admin share audit, link, and delete actions", async () => {
    const user = userEvent.setup();
    const auditShare = vi.fn();
    const deleteShare = vi.fn();
    const editShare = vi.fn();

    renderWithProviders(
      <ManageShareTable
        auditShare={auditShare}
        deleteShare={deleteShare}
        editShare={editShare}
        isLoading={false}
        shares={[
          createMyShare({
            id: "retained-share",
            name: "Retained share",
          }),
        ]}
      />,
      {
        providers: {
          configVariables: [
            createConfig({
              key: "share.fileRetentionPeriod",
              type: "timespan",
              value: "7 days",
            }),
          ],
        },
      },
    );

    const row = screen.getByRole("row", { name: /retained-share/i });

    await user.click(within(row).getByRole("button", { name: /audit files/i }));
    await user.click(within(row).getByRole("button", { name: /edit/i }));
    await user.click(within(row).getByRole("button", { name: /delete/i }));

    expect(auditShare).toHaveBeenCalledWith(
      expect.objectContaining({ id: "retained-share" }),
    );
    expect(deleteShare).toHaveBeenCalledWith(
      expect.objectContaining({ id: "retained-share" }),
    );
    expect(editShare).toHaveBeenCalledWith(
      expect.objectContaining({ id: "retained-share" }),
    );
    expect(
      within(row).getByRole("button", { name: /open public links/i }),
    ).toBeInTheDocument();
  });
});
