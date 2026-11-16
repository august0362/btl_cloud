import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import type { SuggestionDto } from "../api/recommendations";
import type { FileType, SearchParams, Visibility } from "../api/types";
import { validateField } from "../lib/validation";
import { Button, Select, TextField } from "./ui";

export function SearchBar({
  filters,
  mine = false,
  onChange,
  loadSuggestions,
}: {
  filters: SearchParams;
  mine?: boolean;
  onChange: (params: SearchParams) => void;
  loadSuggestions?: (q: string, signal: AbortSignal) => Promise<{ items: SuggestionDto[] }>;
}) {
  const [q, setQ] = useState(filters.q ?? "");
  const [error, setError] = useState<string>();
  const [suggestions, setSuggestions] = useState<SuggestionDto[]>([]);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const listId = useId();
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
      <div>
      <TextField
        label={
          mine ? "Tìm trong tài liệu của tôi" : "Tìm theo tiêu đề hoặc mô tả"
        }
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
      </div>
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
      <Select
        label="Loại tệp"
        value={filters.fileType ?? ""}
        onChange={(event) =>
          onChange({
            fileType: (event.target.value as FileType) || undefined,
            page: 1,
          })
        }
      >
        <option value="">Tất cả</option>
        <option value="PDF">PDF</option>
        <option value="DOCX">DOCX</option>
        <option value="PPTX">PPTX</option>
      </Select>
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
      <Button type="submit">Tìm kiếm</Button>
    </form>
  );
}
