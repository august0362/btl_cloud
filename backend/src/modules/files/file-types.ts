/** Giới hạn và loại tệp theo BR-05 / CN-01 / CN-02. Hằng số trong mã, không phải biến môi trường. */
export const MAX_UPLOAD_BYTES = 52_428_800;

export type FileType = 'PDF' | 'DOCX' | 'PPTX';

export const FILE_TYPES: Record<string, { fileType: FileType; mimeType: string }> = {
  pdf: { fileType: 'PDF', mimeType: 'application/pdf' },
  docx: { fileType: 'DOCX', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pptx: { fileType: 'PPTX', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
};
