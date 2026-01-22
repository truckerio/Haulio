import { openDB } from "idb";
import type { DocType } from "@truckerio/shared";

export type QueuedUpload = {
  id: string;
  loadId: string;
  type: DocType;
  fileName: string;
  mimeType: string;
  blob: Blob;
  createdAt: number;
};

const DB_NAME = "truckerio-uploads";
const STORE_NAME = "uploads";

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
  });
}

export async function enqueueUpload(upload: QueuedUpload) {
  const db = await getDb();
  await db.put(STORE_NAME, upload);
}

export async function listQueuedUploads() {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function removeQueuedUpload(id: string) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}
