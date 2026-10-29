import { Link } from "react-router";
import type { DocumentDto, FileType, Visibility } from "../api/types";
import { formatDate, formatSize } from "../lib/format";
import { Button } from "./ui";

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return (
    <span className={`badge badge--${visibility.toLowerCase()}`}>
      {visibility === "PUBLIC" ? "Công khai" : "Riêng tư"}
    </span>
  );
}
export function FileTypeBadge({ fileType }: { fileType: FileType }) {
  return (
    <span className={`badge badge--${fileType.toLowerCase()}`}>{fileType}</span>
  );
}
export function DownloadAction({
  isAuthenticated,
  loginHref,
  onDownload,
}: {
  isAuthenticated: boolean;
  loginHref: string;
  onDownload: () => void;
}) {
  return isAuthenticated ? (
    <Button requiresBackend variant="secondary" onClick={onDownload}>
      Tải xuống
    </Button>
  ) : (
    <Link className="button button--secondary" to={loginHref}>
      Đăng nhập để tải xuống
    </Link>
  );
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
      <dt>Người đăng</dt>
      <dd>{item.owner.displayName}</dd>
      <dt>Ngày đăng</dt>
      <dd>{formatDate(item.createdAt)}</dd>
      <dt>Tên tệp</dt>
      <dd>{item.originalFilename}</dd>
      <dt>Kích thước</dt>
      <dd>{formatSize(item.sizeBytes)}</dd>
      <dt>Phiên bản</dt>
      <dd>{item.fileVersion}</dd>
      <dt>Cập nhật tệp</dt>
      <dd>{formatDate(item.fileUpdatedAt)}</dd>
    </dl>
  ) : (
    <div className="document-meta">
      <p>{item.owner.displayName}</p>
      <p>
        {formatSize(item.sizeBytes)} · {formatDate(item.createdAt)}
      </p>
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
        {item.isOwner && <span className="badge">Của bạn</span>}
      </div>
      <h2>
        <Link to={`/documents/${item.id}`}>{item.title}</Link>
      </h2>
      {item.description && (
        <p className="document-description">{item.description}</p>
      )}
      <DocumentMeta document={item} />
      <DownloadAction
        isAuthenticated={isAuthenticated}
        loginHref={loginHref}
        onDownload={onDownload}
      />
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
        Tải xuống
      </Button>
      <Link className="button button--ghost" to={`/documents/${item.id}/edit`}>
        Sửa
      </Link>
      <Button
        requiresBackend
        variant="ghost"
        onClick={() => onDelete(item)}
        aria-label={`Xoá ${item.title}`}
      >
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
                <td>{formatSize(item.sizeBytes)}</td>
                <td>{formatDate(item.updatedAt)}</td>
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
