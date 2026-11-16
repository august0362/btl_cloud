import { useMemo } from "react";
import { useSearchParams } from "react-router";
import type { SearchParams } from "../api/types";
import { codePointLength } from "../lib/validation";

export function useDocumentFilters(mine: boolean) {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const filters = useMemo<SearchParams>(() => {
    const current = new URLSearchParams(key);
    const q = current.get("q")?.trim() ?? "";
    const fileType = current.get("fileType");
    const visibility = current.get("visibility");
    const pageText = current.get("page") ?? "1";
    const page =
      /^[1-9]\d*$/.test(pageText) && Number(pageText) <= 10_000
        ? Number(pageText)
        : 1;
    return {
      q: codePointLength(q) <= 100 ? q : "",
      fileType:
        fileType === "PDF" || fileType === "DOCX" || fileType === "PPTX"
          ? fileType
          : undefined,
      visibility:
        mine && (visibility === "PUBLIC" || visibility === "PRIVATE")
          ? visibility
          : undefined,
      sort: current.get("sort") === "title" ? "title" : !mine && current.get("sort") === "relevance" ? "relevance" : current.get("sort") === "newest" ? "newest" : !mine && q ? "relevance" : "newest",
      page,
      pageSize: 12,
    };
  }, [key, mine]);
  const update = (patch: SearchParams) => {
    const next = { ...filters, ...patch };
    if (!mine && patch.q !== undefined && !params.has("sort") && patch.sort === undefined) next.sort = patch.q ? "relevance" : "newest";
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(next)) {
      if (name === "sort" && !params.has("sort") && patch.sort === undefined) continue;
      if (name !== "pageSize" && value !== undefined && value !== "")
        query.set(name, String(value));
    }
    setParams(query);
  };
  return {
    filters,
    update,
    clear: () => setParams(new URLSearchParams()),
    key,
  };
}
