import { queryString, request } from "./client";
import type {
  DocumentDto,
  DocumentPatch,
  Page,
  SearchParams,
  UploadInput,
} from "./types";
import { uploadMultipart, type UploadOptions } from "./upload";

const documentPath = (id: string) => `/api/documents/${encodeURIComponent(id)}`;
export const documentsApi = {
  searchPublic: (
    { visibility: _visibility, ...params }: SearchParams,
    signal?: AbortSignal,
  ) => {
    void _visibility;
    return request<Page<DocumentDto>>(
      "GET",
      `/api/documents${queryString(params)}`,
      { signal },
    );
  },
  listMine: (params: SearchParams, signal?: AbortSignal) =>
    request<Page<DocumentDto>>(
      "GET",
      `/api/documents/mine${queryString(params)}`,
      { signal },
    ),
  get: (id: string, signal?: AbortSignal) =>
    request<DocumentDto>("GET", documentPath(id), { signal }),
  upload: (input: UploadInput, options?: UploadOptions) => {
    const data = new FormData();
    data.append("title", input.title);
    if (input.description?.trim())
      data.append("description", input.description.trim());
    data.append("visibility", input.visibility);
    data.append("file", input.file);
    return uploadMultipart<DocumentDto>(
      "POST",
      "/api/documents",
      data,
      options,
    );
  },
  update: (id: string, body: DocumentPatch) =>
    request<DocumentDto>("PATCH", documentPath(id), { body }),
  replaceFile: (id: string, file: File, options?: UploadOptions) => {
    const data = new FormData();
    data.append("file", file);
    return uploadMultipart<DocumentDto>(
      "PUT",
      `${documentPath(id)}/file`,
      data,
      options,
    );
  },
  remove: (id: string) => request<void>("DELETE", documentPath(id)),
  downloadUrl: (id: string) => `${documentPath(id)}/download`,
};
