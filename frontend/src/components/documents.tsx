import { Link } from "react-router";
import type { DocumentDto, FileType, Visibility } from "../api/types";
import { formatDate, formatSize } from "../lib/format";
import { Icon } from "./Icon";
import { Button } from "./ui";

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return (
    <span className={`badge badge--${visibility.toLowerCase()}`}>
      <Icon name={visibility === "PUBLIC" ? "globe" : "lock"} size={13} />
      {visibility === "PUBLIC" ? "Công khai" : "Riêng tư"}
    </span>
  );
}
export function FileTypeBadge({ fileType }: { fileType: FileType }) {
  return (
    <span className={`badge badge--${fileType.toLowerCase()}`}>
      <Icon name="file" size={13} />
      {fileType}
    </span>
  );
}
export function DownloadAction({
  isAuthenticated,
  loginHref,
  onDownload,
  variant = "secondary",
}: {
  isAuthenticated: boolean;
  loginHref: string;
  onDownload: () => void;
  variant?: "primary" | "secondary";
}) {
  return isAuthenticated ? (
    <Button requiresBackend variant={variant} onClick={onDownload}>
      <Icon name="download" size={18} />
      Tải xuống
    </Button>
  ) : (
    <Link className={`button button--${variant}`} to={loginHref}>
      Đăng nhập để tải xuống
    </Link>
  );
}
function OwnerInitial({ name }: { name: string }) {
  return <span className="initial" aria-hidden="true">{[...name.trim()][0]?.toUpperCase() ?? "?"}</span>;
}
export function DocumentMeta({
  document: item,
  detailed = false,
}: {
  document: DocumentDto;
  detailed?: boolean;
}) {
  return detailed ? (
    <dl className="metadata">
      {([
        ["Người đăng", item.owner.displayName],
        ["Ngày đăng", formatDate(item.createdAt)],
        ["Tên tệp", item.originalFilename],
        ["Kích thước", formatSize(item.sizeBytes)],
        ["Phiên bản", item.fileVersion],
        ["Cập nhật tệp", formatDate(item.fileUpdatedAt)],
      ] as const).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <div className="document-meta document-byline">
      <span className="document-byline__owner">
        <OwnerInitial name={item.owner.displayName} />
        <span>{item.owner.displayName}</span>
      </span>
      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
    </div>
  );
}
export function DocumentCard({
  document: item,
  isAuthenticated,
  loginHref,
  onDownload,
}: {
  document: DocumentDto;
  isAuthenticated: boolean;
  loginHref: string;
  onDownload: () => void;
}) {
  return (
    <article className="document-card">
      <div className="badges">
        <FileTypeBadge fileType={item.fileType} />
        <span className="badge badge--size">{formatSize(item.sizeBytes)}</span>
        {item.isOwner && <span className="badge badge--owner">Của bạn</span>}
      </div>
      <h2>
        <Link to={`/documents/${item.id}`}>{item.title}</Link>
      </h2>
      {item.description && (
        <p className="document-description">{item.description}</p>
      )}
      <DocumentMeta document={item} />
      <div className="document-card__actions">
        <Link className="button button--secondary" to={`/documents/${item.id}`}>
          Chi tiết<span className="sr-only"> về {item.title}</span>
        </Link>
        <DownloadAction
          isAuthenticated={isAuthenticated}
          loginHref={loginHref}
          onDownload={onDownload}
          variant="primary"
        />
      </div>
    </article>
  );
}
export function MyDocumentList({
  items,
  onDownload,
  onDelete,
}: {
  items: DocumentDto[];
  onDownload: (id: string) => void;
  onDelete: (document: DocumentDto) => void;
}) {
  const actions = (item: DocumentDto) => (
    <div className="row-actions">
      <Button requiresBackend variant="ghost" onClick={() => onDownload(item.id)}>
        <Icon name="download" size={16} />
        Tải xuống
      </Button>
      <Link className="button button--ghost" to={`/documents/${item.id}/edit`}>
        <Icon name="edit" size={16} />
        Sửa
      </Link>
      <Button
        requiresBackend
        variant="ghost"
        onClick={() => onDelete(item)}
        aria-label={`Xoá ${item.title}`}
      >
        <Icon name="trash" size={16} />
        Xoá
      </Button>
    </div>
  );
  return (
    <>
      <div className="desktop-list">
        <table>
          <thead>
            <tr>
              {[
                "Tiêu đề",
                "Chế độ",
                "Loại",
                "Kích thước",
                "Cập nhật",
                "Thao tác",
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <th scope="row">
                  <Link to={`/documents/${item.id}`}>{item.title}</Link>
                </th>
                <td>
                  <VisibilityBadge visibility={item.visibility} />
                </td>
                <td>
                  <FileTypeBadge fileType={item.fileType} />
                </td>
                <td className="mono">{formatSize(item.sizeBytes)}</td>
                <td className="mono">{formatDate(item.updatedAt)}</td>
                <td>{actions(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-list">
        {items.map((item) => (
          <article className="document-card" key={item.id}>
            <div className="badges">
              <VisibilityBadge visibility={item.visibility} />
              <FileTypeBadge fileType={item.fileType} />
              <span className="badge badge--size">{formatSize(item.sizeBytes)}</span>
            </div>
            <h2>
              <Link to={`/documents/${item.id}`}>{item.title}</Link>
            </h2>
            <DocumentMeta document={item} />
            {actions(item)}
          </article>
        ))}
      </div>
    </>
  );
}
