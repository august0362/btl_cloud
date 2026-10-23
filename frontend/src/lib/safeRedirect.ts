import { isControl } from "./validation";

export function safeRedirect(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some(isControl)
  )
    return "/me/documents";
  return value;
}
