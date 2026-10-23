import { newId } from '../../lib/ids.js';

/** Key bất biến cho từng phiên bản tệp: documents/{documentId}/{objectId}.{ext} (D-06, INV-D3). */
export function newObjectKey(documentId: string, extension: string): string {
  return `documents/${documentId}/${newId()}.${extension}`;
}
