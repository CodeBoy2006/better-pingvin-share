import { InternalServerErrorException } from "@nestjs/common";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as nodemailer from "nodemailer";
import { EmailService } from "src/email/email.service";
import { defaultConfigMockValues } from "../../fixtures/config.fixture";

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

const createConfigMock = (overrides: Record<string, unknown> = {}) => {
  const values = {
    ...defaultConfigMockValues,
    "email.enableShareEmailRecipients": true,
    "email.inviteMessage": "Use {email} / {password} at {url}",
    "email.inviteSubject": "Invite",
    "email.resetPasswordMessage": "Reset password via {url}",
    "email.resetPasswordSubject": "Reset password",
    "email.reverseShareMessage": "A reverse share is ready at {shareUrl}",
    "email.reverseShareSubject": "Reverse share ready",
    "email.shareRecipientsMessage":
      "Creator: {creator}\\nEmail: {creatorEmail}\\nShare: {shareUrl}\\nDescription: {desc}\\nExpires: {expires}",
    "email.shareRecipientsSubject": "New share",
    "general.appName": "Better Pingvin Share",
    "general.appUrl": "https://share.example.com",
    "smtp.allowUnauthorizedCertificates": false,
    "smtp.email": "bot@example.com",
    "smtp.enabled": true,
    "smtp.host": "smtp.example.com",
    "smtp.password": "",
    "smtp.port": 587,
    "smtp.username": "",
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => {
      if (!(key in values)) {
        throw new Error(`Missing config mock for ${key}`);
      }

      return values[key];
    }),
  };
};

describe("EmailService", () => {
  let config: ReturnType<typeof createConfigMock>;
  let service: EmailService;
  let transporter: { sendMail: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    transporter = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    jest
      .mocked(nodemailer.createTransport)
      .mockReset()
      .mockReturnValue(transporter as never);

    config = createConfigMock();
    service = new EmailService(config as never);
  });

  it("rejects transporter creation when SMTP is disabled", () => {
    service = new EmailService(
      createConfigMock({
        "smtp.enabled": false,
      }) as never,
    );

    expect(() => service.getTransporter()).toThrow(InternalServerErrorException);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it("creates the nodemailer transporter with auth and TLS settings", () => {
    service = new EmailService(
      createConfigMock({
        "smtp.allowUnauthorizedCertificates": true,
        "smtp.password": "secret",
        "smtp.port": 465,
        "smtp.username": "mailer",
      }) as never,
    );

    service.getTransporter();

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      auth: {
        pass: "secret",
        user: "mailer",
      },
      host: "smtp.example.com",
      port: 465,
      secure: true,
      tls: {
        rejectUnauthorized: false,
      },
    });
  });

  it("renders share recipient emails with disabled-service and fallback branches", async () => {
    await service.sendMailToShareRecipients(
      "recipient@example.com",
      "share-123",
      undefined,
      undefined,
      new Date(0),
    );

    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Better Pingvin Share" <bot@example.com>',
        subject: "New share",
        text: expect.stringContaining("Creator: Someone"),
        to: "recipient@example.com",
      }),
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Email: "),
      }),
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "Share: https://share.example.com/s/share-123",
        ),
      }),
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Description: No description"),
      }),
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Expires: in: never"),
      }),
    );

    service = new EmailService(
      createConfigMock({
        "email.enableShareEmailRecipients": false,
      }) as never,
    );

    await expect(
      service.sendMailToShareRecipients("recipient@example.com", "share-123"),
    ).rejects.toThrow("Email service disabled");
  });

  it("renders reverse-share, reset-password, and invite templates", async () => {
    await service.sendMailToReverseShareCreator("creator@example.com", "reverse-1");
    await service.sendResetPasswordEmail("reset@example.com", "reset-token");
    await service.sendInviteEmail("invite@example.com", "Password123!");

    expect(transporter.sendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        subject: "Reverse share ready",
        text: "A reverse share is ready at https://share.example.com/s/reverse-1",
        to: "creator@example.com",
      }),
    );
    expect(transporter.sendMail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subject: "Reset password",
        text: "Reset password via https://share.example.com/auth/resetPassword/reset-token",
        to: "reset@example.com",
      }),
    );
    expect(transporter.sendMail).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        subject: "Invite",
        text: "Use invite@example.com / Password123! at https://share.example.com/auth/signIn",
        to: "invite@example.com",
      }),
    );
  });

  it("surfaces transport failures for test emails", async () => {
    transporter.sendMail.mockRejectedValueOnce(new Error("mailbox unavailable"));

    await expect(service.sendTestMail("recipient@example.com")).rejects.toThrow(
      "mailbox unavailable",
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Test email",
        text: "This is a test email",
        to: "recipient@example.com",
      }),
    );
  });
});
