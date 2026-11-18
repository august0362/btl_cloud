import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router";
import { recommendationsApi, type HomeRecommendations as HomeRecommendationsDto } from "../api/recommendations";
import { documentsApi } from "../api/documents";
import { useAuth } from "../auth/context";
import { DocumentCard, MyDocumentList } from "../components/documents";
import { Icon } from "../components/Icon";
import { Pagination } from "../components/Pagination";
import { SearchBar } from "../components/SearchBar";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  LinkButton,
  Spinner,
} from "../components/ui";
import { useDeleteDocument } from "../hooks/useDeleteDocument";
import { useDocumentFilters } from "../hooks/useDocumentFilters";
import { useDownload } from "../hooks/useDownload";
import { usePageTitle } from "../hooks/usePageTitle";
import { useResource } from "../hooks/useResource";
import { errorMessage } from "../lib/errorMessages";
import { formatSize } from "../lib/format";

function DocumentListPage({ mine }: { mine: boolean }) {
  const title = mine ? "Tài liệu của tôi" : "Khám phá tài liệu học tập";
  usePageTitle(mine ? title : "Khám phá tài liệu");
  const { user } = useAuth();
  const location = useLocation();
  const { filters, update, clear, key } = useDocumentFilters(mine);
  const loader = useCallback(
    (signal: AbortSignal) => {
      // Cookie identity changes the server's isOwner field; refetch after login/logout.
      void user?.id;
      return mine
        ? documentsApi.listMine(filters, signal)
        : documentsApi.searchPublic(filters, signal);
    },
    [mine, filters, user?.id],
  );
  const { data, error, loading, reload } = useResource(loader, `${mine}:${user?.id ?? "guest"}`);
  const download = useDownload();
  const deletion = useDeleteDocument(() => {
    if (data?.items.length === 1 && (filters.page ?? 1) > 1)
      update({ page: (filters.page ?? 1) - 1 });
    else reload();
  });
  const filtered = Boolean(
    filters.q ||
      filters.fileType ||
      filters.visibility ||
      filters.sort === "title",
  );
  const loginHref = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
  const results = (
    <section aria-label="Danh sách tài liệu" aria-busy={loading}>
      {loading && !data ? (
        mine ? (
          <Spinner />
        ) : (
          <div
            className="document-grid"
            role="status"
            aria-label="Đang tải tài liệu"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div className="document-card skeleton" key={index} />
            ))}
          </div>
        )
      ) : data?.items.length ? (
        <div className={loading ? "stale-results" : undefined}>
          {mine ? (
            <MyDocumentList
              items={data.items}
              onDownload={download}
              onDelete={deletion.open}
            />
          ) : (
            <div className="document-grid">
              {data.items.map((item) => (
                <DocumentCard
                  key={item.id}
                  document={item}
                  isAuthenticated={Boolean(user)}
                  loginHref={loginHref}
                  onDownload={() => void download(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title={
            filtered
              ? mine
                ? "Không có tài liệu phù hợp bộ lọc."
                : `Không tìm thấy tài liệu phù hợp với “${filters.q ?? ""}”.`
              : mine
                ? "Bạn chưa có tài liệu nào."
                : "Chưa có tài liệu công khai nào."
          }
          description={filtered ? "Thử từ khoá khác hoặc bỏ bớt bộ lọc." : undefined}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clear}>
                Xoá bộ lọc
              </Button>
            ) : mine ? (
              <LinkButton to="/upload">
                Tải lên tài liệu đầu tiên
              </LinkButton>
            ) : user ? (
              <LinkButton to="/upload">Tải lên tài liệu</LinkButton>
            ) : undefined
          }
        />
      )}
      {data && (
        <Pagination
          page={filters.page ?? 1}
          totalPages={data.totalPages}
          totalItems={data.totalItems}
          pageSize={data.pageSize}
          shown={data.items.length}
          onPageChange={(page) => update({ page })}
        />
      )}
    </section>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{mine ? "Không gian của bạn" : "Tra cứu & khám phá"}</p>
          <h1 tabIndex={-1}>{title}</h1>
          <p className="muted">
            {mine
              ? "Quản lý, chỉnh sửa và chia sẻ các tài liệu bạn đã tải lên."
              : "Tìm tài liệu được chia sẻ công khai để học tập và nghiên cứu."}
          </p>
        </div>
        {mine ? (
          <LinkButton to="/upload"><Icon name="upload" size={18} />Tải lên tài liệu</LinkButton>
        ) : (
          <span className="page-heading__note"><Icon name="book" size={18} />Bài giảng, đề cương, slide dạng PDF · DOCX · PPTX</span>
        )}
      </div>
      {!mine && (
        <div className="info-strip">
          <Icon name="shield" size={20} />
          <p>
            Tìm kiếm đối sánh trên <strong>tiêu đề và mô tả</strong> (không phân biệt dấu). Kết quả chỉ gồm tài liệu ở chế độ <span className="chip-code">Công khai</span>.
          </p>
        </div>
      )}
      <SearchBar
        key={key}
        loadSuggestions={mine ? undefined : recommendationsApi.suggestions}
        filters={filters}
        mine={mine}
        onChange={update}
        summary={data && (
          <p className="result-count">
            <Icon name="file" size={16} />
            {mine ? `${data.totalItems} tài liệu` : `Tìm thấy ${data.totalItems} tài liệu`}
          </p>
        )}
      />
      {error != null && data && <Alert tone="info">{errorMessage(error)} Đang hiển thị kết quả đã tải trước đó.</Alert>}
      {error && !data ? (
        <Alert
          title={
            mine
              ? "Không thể tải tài liệu của bạn."
              : "Không thể tải danh sách tài liệu."
          }
        >
          <p>{errorMessage(error)}</p>
          <Button variant="secondary" onClick={reload}>
            Thử lại
          </Button>
        </Alert>
      ) : mine ? (
        results
      ) : (
        <div className="discover">
          {results}
          <aside className="discover__aside" aria-label="Gợi ý và hướng dẫn">
            {!filters.q && (filters.page ?? 1) === 1 && <HomeRecommendations userId={user?.id} />}
            <section className="side-card" aria-labelledby="discover-rules">
              <div className="side-card__head">
                <h2 id="discover-rules"><Icon name="info" size={18} />Cách tra cứu</h2>
              </div>
              <ul className="rule-list">
                <li><Icon name="check" size={16} />Gõ từ 2 ký tự để nhận gợi ý tiêu đề; chọn gợi ý để mở tài liệu.</li>
                <li><Icon name="check" size={16} />Khách xem được thông tin tài liệu; cần đăng nhập để tải xuống.</li>
                <li><Icon name="check" size={16} />Tài liệu Riêng tư chỉ chủ sở hữu thấy, không xuất hiện ở đây.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deletion.target)}
        title="Xoá vĩnh viễn tài liệu?"
        message={`Tài liệu “${deletion.target?.title ?? ""}” và tệp đính kèm sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.`}
        confirmLabel="Xoá vĩnh viễn"
        tone="danger"
        loading={deletion.busy}
        error={deletion.error}
        onCancel={deletion.cancel}
        onConfirm={() => void deletion.confirm()}
      />
    </>
  );
}
export function HomePage() {
  return <DocumentListPage mine={false} />;
}
export function MyDocumentsPage() {
  return <DocumentListPage mine />;
}

const REASON_LABEL: Record<HomeRecommendationsDto["items"][number]["reason"], string> = {
  SIMILAR_TO_HISTORY: "Gần với tài liệu bạn đã xem",
  POPULAR: "Được xem nhiều",
  NEW: "Mới đăng",
};
const STRATEGY: Record<HomeRecommendationsDto["strategy"], { title: string; note: string }> = {
  PERSONALIZED: { title: "Gợi ý cho bạn", note: "Dựa trên tài liệu Công khai bạn đã xem hoặc tải trong 90 ngày." },
  POPULAR: { title: "Tài liệu nổi bật", note: "Tài liệu Công khai được xem và tải nhiều gần đây." },
  NEWEST: { title: "Tài liệu nổi bật", note: "Tài liệu Công khai mới đăng gần đây." },
};

function HomeRecommendations({ userId }: { userId?: string }) {
  const homeLoader = useCallback((signal: AbortSignal) => recommendationsApi.home(8, signal), []);
  const settingsLoader = useCallback((signal: AbortSignal) => userId ? recommendationsApi.getSettings(signal) : Promise.resolve(null), [userId]);
  const home = useResource(homeLoader, userId ?? 'guest');
  const settings = useResource(settingsLoader, userId ?? 'guest');
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const change = async (enabled: boolean) => {
    setBusy(true); setFailure('');
    try { await recommendationsApi.putSettings(enabled); settings.reload(); home.reload(); setOpen(false); }
    catch (error) { setFailure(errorMessage(error)); } finally { setBusy(false); }
  };
  const clearHistory = async () => {
    setBusy(true); setFailure('');
    try { await recommendationsApi.deleteHistory(); settings.reload(); home.reload(); }
    catch (error) { setFailure(errorMessage(error)); } finally { setBusy(false); }
  };
  const items = !home.error && home.data && Array.isArray(home.data.items) ? home.data.items : [];
  const strategy = home.data ? STRATEGY[home.data.strategy] ?? STRATEGY.NEWEST : null;
  const hasSettings = Boolean(userId && !settings.error && settings.data && typeof settings.data.personalizationEnabled === 'boolean');
  if (!items.length && !hasSettings) return null;
  return (
    <section className="side-card side-card--muted" aria-label="Gợi ý tài liệu">
      {items.length > 0 && strategy && <>
        <div className="side-card__head">
          <h2><Icon name="sparkles" size={18} />{strategy.title}</h2>
          {home.data?.strategy === 'PERSONALIZED' && <span className="tag">Cá nhân hoá</span>}
        </div>
        <p className="muted">{strategy.note}</p>
        <ul className="mini-list">
          {items.map(({ document, reason }) => (
            <li key={document.id}>
              <Link to={`/documents/${document.id}`}>{document.title}</Link>
              <small>{document.fileType} · {formatSize(document.sizeBytes)} · {REASON_LABEL[reason] ?? ''}</small>
            </li>
          ))}
        </ul>
      </>}
      {hasSettings && settings.data && (settings.data.personalizationEnabled
        ? <Button variant="secondary" className="button--small" onClick={() => setOpen(true)}><Icon name="sliders" size={16} />Tuỳ chọn gợi ý</Button>
        : <p className="muted">Bật gợi ý cá nhân hoá để nhận tài liệu hợp với bạn. <Button variant="ghost" className="button--small" onClick={() => setOpen(true)}>Bật</Button></p>)}
      {open && settings.data && (
        <section className="settings-panel" role="region" aria-label="Tuỳ chọn gợi ý">
          <h3>Tuỳ chọn gợi ý</h3>
          <p className="muted">Khi bật, hệ thống lưu tài liệu bạn xem và tải trong 90 ngày để gợi ý, và dùng ẩn danh để xếp hạng tài liệu phổ biến. Tắt bất cứ lúc nào, lịch sử sẽ bị xoá.</p>
          {failure && <Alert>{failure}</Alert>}
          <div className="actions">
            <Button role="switch" aria-checked={settings.data.personalizationEnabled} loading={busy} onClick={() => void change(!settings.data!.personalizationEnabled)}>{settings.data.personalizationEnabled ? 'Tắt cá nhân hoá' : 'Xác nhận bật cá nhân hoá'}</Button>
            {settings.data.personalizationEnabled && <Button variant="secondary" loading={busy} onClick={() => void clearHistory()}>Xoá lịch sử</Button>}
            <Button variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
          </div>
        </section>
      )}
    </section>
  );
}
