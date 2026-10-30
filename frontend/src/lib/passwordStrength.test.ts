import { describe, expect, it } from "vitest";
import { passwordStrength } from "./passwordStrength";

describe("E6-AC-01: ba tiêu chí, độ dài Unicode", () => {
  it.each([
    ["abc", "INVALID"], ["abcdefgh", "WEAK"], ["Abcdefgh", "MEDIUM"],
    ["Abcdefgh!", "MEDIUM"], ["abcdefghijklm", "MEDIUM"], ["Abcdefgh!xyz1", "STRONG"],
    ["Đặcbiệt12345", "MEDIUM"], ["Đặcbiệt12345#", "STRONG"],
    ["", "INVALID"], ["😀😀😀😀", "INVALID"], ["abcdefgh1234", "WEAK"],
  ])("%s → %s", (password, level) => expect(passwordStrength(password).level).toBe(level));

  it("nhận chữ hoa tiếng Việt, không xem chữ có dấu là ký tự đặc biệt", () => {
    expect(passwordStrength("Ầbcdefgh12345")).toEqual({
      level: "MEDIUM", criteria: { upper: true, special: false, long: true },
    });
    expect(passwordStrength("abcdefghijk😀").criteria).toEqual({ upper: false, special: true, long: false });
  });
});
