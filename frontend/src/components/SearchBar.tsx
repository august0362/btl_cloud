import { useState } from "react";
import type { FileType, SearchParams, Visibility } from "../api/types";
import { validateField } from "../lib/validation";
import { Button, Select, TextField } from "./ui";

export function SearchBar({
  filters,
  mine = false,
  onChange,
}: {
  filters: SearchParams;
  mine?: boolean;
  onChange: (params: SearchParams) => void;
}) {
  const [q, setQ] = useState(filters.q ?? "");
  const [error, setError] = useState<string>();
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
      <TextField
        label={
          mine ? "Tìm trong tài liệu của tôi" : "Tìm theo tiêu đề hoặc mô tả"
        }
        name="q"
        value={q}
        error={error}
        onChange={(event) => {
          setQ(event.target.value);
          if (error) setError(validateField("q", event.target.value));
        }}
        onBlur={() => setError(validateField("q", q))}
      />
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
          onChange({ sort: event.target.value as "newest" | "title", page: 1 })
        }
      >
        <option value="newest">Mới nhất</option>
        <option value="title">Tiêu đề A–Z</option>
      </Select>
      <Button type="submit">Tìm kiếm</Button>
    </form>
  );
}
