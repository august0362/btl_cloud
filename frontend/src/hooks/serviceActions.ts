import { serviceLabels, serviceMonitor, type ServiceSnapshot, type ServiceState } from "../api/serviceStatus";

export const statusLabel = (state: ServiceState) => serviceLabels[state];
export const retryServices = () => { void serviceMonitor.check(true); };
export function statusDescription(snapshot: ServiceSnapshot) {
  if (snapshot.state === "offline") return "Chưa kết nối được máy chủ. Bạn có thể tiếp tục soạn nội dung và thử lại sau.";
  if (snapshot.state === "reconnecting") return "Đang kiểm tra kết nối với máy chủ…";
  if (snapshot.state === "online") return "Máy chủ, cơ sở dữ liệu và kho tệp đang sẵn sàng.";
  const affected = [snapshot.database === "unavailable" && "cơ sở dữ liệu (MySQL)", snapshot.storage === "unavailable" && "kho tệp (SeaweedFS/S3)"].filter(Boolean);
  return affected.length
    ? `Máy chủ đang hoạt động; ${affected.join(" và ")} chưa sẵn sàng. ${snapshot.database === "unavailable" ? "Đăng nhập và dữ liệu có thể bị gián đoạn." : "Bạn vẫn có thể xem metadata; tải lên và tải xuống có thể bị gián đoạn."}`
    : "Máy chủ đang hoạt động nhưng chưa xác định được trạng thái các dịch vụ phụ thuộc.";
}
