import type { PrismaClient } from '@prisma/client';
import { CleanupTaskRepository } from './cleanup/cleanup.repository.js';
import { CleanupService } from './cleanup/cleanup.service.js';
import type { Config } from './config/env.js';
import { createTransactionRunner } from './db/prisma.js';
import { systemClock, type Clock } from './lib/clock.js';
import type { Logger } from './lib/logger.js';
import { AuthService } from './modules/auth/auth.service.js';
import { SessionRepository } from './modules/auth/session.repository.js';
import { DocumentRepository } from './modules/documents/document.repository.js';
import { DocumentService } from './modules/documents/documents.service.js';
import { UserRepository } from './modules/users/user.repository.js';
import type { ObjectStorage } from './storage/object-storage.js';

export interface Services {
  users: UserRepository;
  sessions: SessionRepository;
  documents: DocumentRepository;
  cleanupTasks: CleanupTaskRepository;
  auth: AuthService;
  cleanup: CleanupService;
  documentService: DocumentService;
  clock: Clock;
}

/** Lắp ráp repository và service cho một process (dùng chung cho server và test). */
export function createServices(deps: {
  config: Config;
  logger: Logger;
  prisma: PrismaClient;
  storage: ObjectStorage;
  clock?: Clock;
}): Services {
  const clock = deps.clock ?? systemClock;
  const runInTransaction = createTransactionRunner(deps.prisma);
  const users = new UserRepository(deps.prisma);
  const sessions = new SessionRepository(deps.prisma);
  const documents = new DocumentRepository(deps.prisma);
  const cleanupTasks = new CleanupTaskRepository(deps.prisma);
  const auth = new AuthService(runInTransaction, users, sessions, clock, deps.config.session.ttlHours);
  const cleanup = new CleanupService(cleanupTasks, documents, deps.storage, clock, deps.logger, deps.config.upload.guardMinutes);
  const documentService = new DocumentService(
    runInTransaction,
    documents,
    cleanup,
    deps.storage,
    clock,
    deps.logger,
    deps.config.cleanup.graceSeconds,
  );
  return { users, sessions, documents, cleanupTasks, auth, cleanup, documentService, clock };
}
