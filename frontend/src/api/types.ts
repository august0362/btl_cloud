export type Visibility = "PUBLIC" | "PRIVATE";
export type FileType = "PDF" | "DOCX" | "PPTX";
export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}
export interface OwnerDto {
  id: string;
  displayName: string;
}
export interface DocumentDto {
  id: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  fileType: FileType;
  originalFilename: string;
  sizeBytes: number;
  fileVersion: number;
  owner: OwnerDto;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  fileUpdatedAt: string;
}
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
export interface ValidationIssue {
  field: string;
  issue: string;
  message: string;
}
export interface MeData {
  user: UserDto | null;
}
export interface UserData {
  user: UserDto;
}
export interface LoginInput {
  email: string;
  password: string;
}
export interface RegisterInput extends LoginInput {
  displayName: string;
}
export interface SearchParams {
  q?: string;
  fileType?: FileType;
  visibility?: Visibility;
  sort?: "newest" | "title";
  page?: number;
  pageSize?: number;
}
export interface DocumentPatch {
  title?: string;
  description?: string | null;
  visibility?: Visibility;
}
export interface UploadInput {
  title: string;
  description?: string;
  visibility: Visibility;
  file: File;
}
