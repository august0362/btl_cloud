import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

describe("PasswordStrengthMeter", () => {
  it("có nhãn chữ, aria-live và ghi chú E6-FR-04; cập nhật khi gõ", () => {
    const { rerender } = render(<PasswordStrengthMeter password="abc" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent("Độ mạnh mật khẩu: Quá ngắn");
    for (const [password, label] of [["abcdefgh", "Yếu"], ["Abcdefgh!", "Trung bình"], ["Abcdefgh!xyz1", "Mạnh"]]) {
      rerender(<PasswordStrengthMeter password={password} />);
      expect(status).toHaveTextContent(`Độ mạnh mật khẩu: ${label}`);
    }
    expect(screen.getByText("Chỉ là gợi ý theo ba quy tắc đơn giản, không phải đánh giá bảo mật đầy đủ.")).toBeVisible();
  });
});
