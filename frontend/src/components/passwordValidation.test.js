import { describe, expect, it } from "vitest";
import {
  passwordPairValidation,
  passwordRequirements,
} from "./passwordValidation";

describe("password policy matches the API", () => {
  it.each([
    ["aA1!", ["length"]],
    ["lowercase123!", ["uppercase"]],
    ["UPPERCASE123!", ["lowercase"]],
    ["LongPassword!!", ["number"]],
    ["LongPassword123", ["symbol"]],
    ["LongPassword123!", []],
    ["LongPassword123 ", []],
    ["Äbcdefghijkl١!", []],
    ["Aa1!😀😀😀😀", ["length"]],
  ])("checks every requirement for %s", (password, missing) => {
    expect(
      passwordRequirements(password)
        .filter((rule) => !rule.met)
        .map((rule) => rule.id),
    ).toEqual(missing);
  });

  it("requires confirmation to track edits to the original password", () => {
    expect(
      passwordPairValidation("LongPassword123!", "LongPassword123!")
        .confirmation,
    ).toBe("");
    expect(
      passwordPairValidation("ChangedPassword123!", "LongPassword123!")
        .confirmation,
    ).toBe("Passwords do not match.");
  });
  it("allows an unchanged account password only when both optional inputs are empty", () => {
    expect(passwordPairValidation("", "", true)).toMatchObject({
      active: false,
      password: "",
      confirmation: "",
    });
    expect(passwordPairValidation("", "Anything123!", true)).toMatchObject({
      active: true,
      password: "Enter a password.",
    });
    expect(
      passwordPairValidation("LongPassword123!", "", true).confirmation,
    ).toBe("Confirm your password.");
  });
});
