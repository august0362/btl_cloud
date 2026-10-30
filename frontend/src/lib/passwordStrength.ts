export type PasswordStrengthLevel = "INVALID" | "WEAK" | "MEDIUM" | "STRONG";

/** Chỉ báo tham khảo theo ba quy tắc của ARCHITECTURE §A12.3 (XM-11). */
export function passwordStrength(password: string): {
  level: PasswordStrengthLevel;
  criteria: { upper: boolean; special: boolean; long: boolean };
} {
  const length = [...password].length;
  const criteria = {
    upper: /\p{Lu}/u.test(password),
    special: /[^\p{L}\p{N}]/u.test(password),
    long: length > 12,
  };
  const score = Object.values(criteria).filter(Boolean).length;
  const level = length < 8 ? "INVALID" : score === 0 ? "WEAK" : score < 3 ? "MEDIUM" : "STRONG";
  return { level, criteria };
}
