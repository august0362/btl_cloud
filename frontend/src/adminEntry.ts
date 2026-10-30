import { lazy, type ComponentType } from "react";

// XM-03: admin là thư mục gitignore, chỉ có trên máy owner. Không import trực tiếp; glob rỗng → không có route/link.
const loaders = import.meta.env.DEV
  ? import.meta.glob<{ default: ComponentType }>("./admin/AdminApp.tsx")
  : {};
const load = Object.values(loaders)[0];

export const AdminApp = load ? lazy(load) : null;
