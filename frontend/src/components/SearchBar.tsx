import { useEffect, useId, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { SuggestionDto } from "../api/recommendations";
import type { FileType, SearchParams, Visibility } from "../api/types";
import { validateField } from "../lib/validation";
import { Icon } from "./Icon";
import { Button, Select, TextField } from "./ui";

const FILE_TYPES: { value: "" | FileType; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "PDF", label: "PDF" },
  { value: "DOCX", label: "DOCX" },
  { value: "PPTX", label: "PPTX" },
];

export function SearchBar({
  filters,
  mine = false,
  onChange,
  loadSuggestions,
  summary,
}: {
  filters: SearchParams;
  mine?: boolean;
  onChange: (params: SearchParams) => void;
  loadSuggestions?: (q: string, signal: AbortSignal) => Promise<{ items: SuggestionDto[] }>;
  /** Result count shown at the end of the filter toolbar. */
  summary?: ReactNode;
}) {
  const [q, setQ] = useState(filters.q ?? "");
  const [error, setError] = useState<string>();
  const [suggestions, setSuggestions] = useState<SuggestionDto[]>([]);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const listId = useId();
  const typeName = useId();
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    if (!loadSuggestions || mine || [...q.trim()].length < 2 || [...q.trim()].length > 100 || dismissed) return () => controller.abort();
    const timer = setTimeout(() => {
      void loadSuggestions(q.trim(), controller.signal).then((data) => {
        if (!controller.signal.aborted) { setSuggestions(data.items); setActive(-1); }
      }).catch(() => { if (!controller.signal.aborted) setSuggestions([]); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, mine, dismissed, loadSuggestions]);
  const choose = (item: SuggestionDto) => { setSuggestions([]); setDismissed(true); navigate(`/documents/${item.documentId}`); };
  const submit = () => {
    const failure = validateField("q", q);
    setError(failure);
    if (!failure) onChange({ q: q.trim(), page: 1 });
  };
  return (
    <form
      className={`search-bar ${mine ? "search-bar--mine" : ""}`}
      role="search"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="search-bar__main">
        <TextField
          hideLabel
          label={
            mine ? "Tìm trong tài liệu của tôi" : "Tìm theo tiêu đề hoặc mô tả"
          }
          placeholder={
            mine
              ? "Tìm theo tiêu đề hoặc mô tả tài liệu của bạn…"
              : "Nhập tiêu đề hoặc từ khoá trong mô tả tài liệu…"
          }
          leading={<Icon name="search" size={22} />}
          name="q"
          role={!mine ? "combobox" : undefined}
          aria-autocomplete={!mine ? "list" : undefined}
          aria-expanded={!mine ? suggestions.length > 0 : undefined}
          aria-controls={!mine ? listId : undefined}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setSuggestions([]); setDismissed(true); setActive(-1); }
            else if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault(); setActive((value) => event.key === "ArrowDown" ? (value + 1) % suggestions.length : (value <= 0 ? suggestions.length - 1 : value - 1));
            } else if (event.key === "Enter" && active >= 0 && suggestions[active]) { event.preventDefault(); choose(suggestions[active]); }
          }}
          value={q}
          error={error}
          onChange={(event) => {
            setQ(event.target.value);
            setSuggestions([]); setActive(-1); setDismissed(false);
            if (error) setError(validateField("q", event.target.value));
          }}
          onFocus={() => setDismissed(false)}
          onBlur={() => { setError(validateField("q", q)); setSuggestions([]); setDismissed(true); }}
        />
        {suggestions.length > 0 && <ul id={listId} role="listbox" aria-label="Gợi ý tài liệu">{suggestions.map((item, index) => <li key={item.documentId} id={`${listId}-${index}`} role="option" aria-selected={index === active} onMouseDown={(event) => { event.preventDefault(); choose(item); }}>{item.title}</li>)}</ul>}
        <Button type="submit">Tìm kiếm</Button>
      </div>
      <div className="toolbar">
        <fieldset className="chips">
          <legend className="toolbar__label">Định dạng:</legend>
          {FILE_TYPES.map((type) => (
            <label key={type.label} className={`chip ${type.value ? `chip--${type.value.toLowerCase()}` : ""}`}>
              <input
                type="radio"
                name={typeName}
                value={type.value}
                checked={(filters.fileType ?? "") === type.value}
                onChange={() => onChange({ fileType: type.value || undefined, page: 1 })}
              />
              {type.value && <span className="chip__dot" aria-hidden="true" />}
              {type.label}
            </label>
          ))}
        </fieldset>
        {mine && (
          <Select
            label="Chế độ"
            value={filters.visibility ?? ""}
            onChange={(event) =>
              onChange({
                visibility: (event.target.value as Visibility) || undefined,
                page: 1,
              })
            }
          >
            <option value="">Tất cả</option>
            <option value="PUBLIC">Công khai</option>
            <option value="PRIVATE">Riêng tư</option>
          </Select>
        )}
        <div className="toolbar__group toolbar__group--end">
          <Select
            label="Sắp xếp"
            value={filters.sort}
            onChange={(event) =>
              onChange({ sort: event.target.value as "newest" | "title" | "relevance", page: 1 })
            }
          >
            {!mine && <option value="relevance">Liên quan nhất</option>}
            <option value="newest">Mới nhất</option>
            <option value="title">Tiêu đề A–Z</option>
          </Select>
          {summary}
        </div>
      </div>
    </form>
  );
}
