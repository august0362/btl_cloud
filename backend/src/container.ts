import type { PrismaClient } from '@prisma/client';
import type { Config } from './config/env.js';
import { createTransactionRunner } from './db/prisma.js';
import { systemClock, type Clock } from './lib/clock.js';
import type { Logger } from './lib/logger.js';
import { AuditRecorder } from './modules/audit/audit.recorder.js';
import { AuditRepository } from './modules/audit/audit.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { SessionRepository } from './modules/auth/session.repository.js';
import { DocumentRepository } from './modules/documents/document.repository.js';
import { DocumentService } from './modules/documents/documents.service.js';
import { ActivityTracker } from './modules/users/activity-tracker.js';
import { UserRepository } from './modules/users/user.repository.js';
import type { ObjectStorage } from './storage/object-storage.js';

export interface Services {
  users: UserRepository;
  sessions: SessionRepository;
  documents: DocumentRepository;
  auth: AuthService;
  documentService: DocumentService;
  activity: ActivityTracker;
  auditEvents: AuditRepository;
  audit: AuditRecorder;
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
  const auth = new AuthService(runInTransaction, users, sessions, clock, deps.config.session.ttlHours);
  const documentService = new DocumentService(
    documents,
    deps.storage,
    clock,
    deps.logger,
  );
  const activity = new ActivityTracker(users, clock, deps.logger);
  const auditEvents = new AuditRepository(deps.prisma);
  const audit = new AuditRecorder(auditEvents, clock, deps.logger);
  return { users, sessions, documents, auth, documentService, activity, auditEvents, audit, clock };
}
