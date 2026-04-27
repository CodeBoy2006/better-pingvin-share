import "class-transformer";
import "class-validator";

jest.setTimeout(30_000);

jest.mock("moment", () => {
  const actualMoment = jest.requireActual("moment");
  const callableMoment = actualMoment.default ?? actualMoment;

  return Object.assign(callableMoment, actualMoment);
});

jest.mock("qrcode-svg", () => {
  return class MockQrCode {
    constructor(private readonly options: { content: string }) {}

    svg() {
      return `<svg>${this.options.content}</svg>`;
    }
  };
});
