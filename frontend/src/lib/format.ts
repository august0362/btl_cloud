export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export function formatSize(bytes: number) {
  const isMB = bytes >= 1024 * 1024;
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1, minimumFractionDigits: isMB ? 1 : 0 }).format(bytes / (isMB ? 1024 * 1024 : 1024))} ${isMB ? "MB" : "KB"}`;
}
