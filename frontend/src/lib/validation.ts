import { FILE_EXTENSIONS, MAX_UPLOAD_BYTES } from "./constants";

export type FormErrors = Record<string, string | undefined>;
export const codePointLength = (value: string) => [...value].length;
export const isControl = (char: string) =>
  char.codePointAt(0)! < 32 || char.codePointAt(0) === 127;
export function validateField(
  name: string,
  value: string,
  registration = false,
): string | undefined {
  const trimmed = value.trim();
  const length = codePointLength(value);
  switch (name) {
    case "email":
      if (!trimmed) return "Vui lòng nhập email.";
      if (codePointLength(trimmed) > 254) return "Email tối đa 254 ký tự.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
        return "Email không hợp lệ.";
      break;
    case "password":
      if (!value) return "Vui lòng nhập mật khẩu.";
      if (registration && length < 8) return "Mật khẩu tối thiểu 8 ký tự.";
      if (length > 128) return "Mật khẩu tối đa 128 ký tự.";
      break;
    case "displayName":
      if (!trimmed) return "Vui lòng nhập tên hiển thị.";
      if (codePointLength(trimmed) > 100)
        return "Tên hiển thị tối đa 100 ký tự.";
      if ([...trimmed].some(isControl))
        return "Tên hiển thị chứa ký tự không hợp lệ.";
      break;
    case "title":
      if (!trimmed) return "Vui lòng nhập tiêu đề.";
      if (codePointLength(trimmed) > 200) return "Tiêu đề tối đa 200 ký tự.";
      if ([...trimmed].some(isControl))
        return "Tiêu đề không được chứa ký tự xuống dòng.";
      break;
    case "description":
      if (codePointLength(trimmed) > 2000) return "Mô tả tối đa 2000 ký tự.";
      if (
        [...trimmed].some(
          (char) => isControl(char) && !["\n", "\r", "\t"].includes(char),
        )
      )
        return "Mô tả chứa ký tự không hợp lệ.";
      break;
    case "visibility":
      if (!["PUBLIC", "PRIVATE"].includes(value))
        return "Vui lòng chọn chế độ hiển thị.";
      break;
    case "q":
      if (codePointLength(trimmed) > 100) return "Từ khoá tối đa 100 ký tự.";
  }
}

export function validateFile(file: File | null): string | undefined {
  if (!file) return "Vui lòng chọn tệp.";
  if (
    !FILE_EXTENSIONS.includes(file.name.split(".").pop()?.toLowerCase() ?? "")
  )
    return "Chỉ hỗ trợ tệp PDF, DOCX, PPTX.";
  if (file.size === 0) return "Tệp rỗng, vui lòng chọn tệp khác.";
  if (file.size > MAX_UPLOAD_BYTES)
    return "Tệp vượt quá dung lượng tối đa 50 MB.";
}
export function titleFromFile(file: File) {
  return [...file.name.replace(/\.[^.]+$/, "")]
    .filter((char) => !isControl(char))
    .slice(0, 200)
    .join("");
}
export const hasErrors = (errors: FormErrors) =>
  Object.values(errors).some(Boolean);
export function focusFirstError(form: HTMLFormElement | null) {
  requestAnimationFrame(() =>
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
  );
}
