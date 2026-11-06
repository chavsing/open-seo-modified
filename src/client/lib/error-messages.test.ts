import { describe, expect, it } from "vitest";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { BRAND_NAME } from "@/shared/brand";

describe("getStandardErrorMessage", () => {
  it("maps known error codes to standard copy", () => {
    expect(getStandardErrorMessage(new Error("PAYMENT_REQUIRED"))).toBe(
      `An active hosted subscription is required before you can use ${BRAND_NAME}.`,
    );
  });

  it("returns custom messages when the error is not a shared code", () => {
    expect(
      getStandardErrorMessage(new Error("Something failed: try again")),
    ).toBe("Something failed: try again");
  });
});
