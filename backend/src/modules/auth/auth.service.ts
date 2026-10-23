import { isUniqueViolation, type TransactionRunner } from '../../db/prisma.js';
import { AppError } from '../../http/errors.js';
import type { Clock } from '../../lib/clock.js';
import { newId } from '../../lib/ids.js';
import type { UserRepository } from '../users/user.repository.js';
import { toUserDto, type UserDto } from '../users/user.mapper.js';
import { hashPassword, verifyPassword } from './password.js';
import type { SessionRepository } from './session.repository.js';
import { hashSessionToken, newSessionToken } from './session-token.js';

export interface AuthContext {
  userId: string;
  sessionId: string;
  user: { id: string; email: string; displayName: string; createdAt: Date };
}

export interface AuthResult {
  user: UserDto;
  token: string;
  expiresAt: Date;
}

/** Đăng ký, đăng nhập, đăng xuất, nạp phiên (§A5.1–§A5.2). Phiên lưu DB → dùng chung giữa mọi instance. */
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly runInTransaction: TransactionRunner,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
    private readonly sessionTtlHours: number,
  ) {}

  private expiry(): Date {
    return new Date(this.clock.now().getTime() + this.sessionTtlHours * 3600 * 1000);
  }

  /** Xoay phiên khi đăng nhập/đăng ký: xoá phiên của cookie cũ (chống session fixation). */
  private async revokePrevious(previousToken: string | undefined): Promise<void> {
    if (previousToken) await this.sessions.delete(hashSessionToken(previousToken));
  }

  async register(
    input: { email: string; password: string; displayName: string },
    previousToken?: string,
  ): Promise<AuthResult> {
    const passwordHash = await hashPassword(input.password);
    await this.revokePrevious(previousToken);
    const userId = newId();
    const token = newSessionToken();
    const expiresAt = this.expiry();
    try {
      const user = await this.runInTransaction(async (tx) => {
        const created = await this.users.create({ id: userId, email: input.email, passwordHash, displayName: input.displayName }, tx);
        await this.sessions.create({ id: hashSessionToken(token), userId, expiresAt }, tx);
        return created;
      });
      return { user: toUserDto(user), token, expiresAt };
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('EMAIL_ALREADY_EXISTS');
      throw error;
    }
  }

  async login(input: { email: string; password: string }, previousToken?: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      // Vẫn chạy verify với hash giả để thời gian phản hồi tương đương (§A5.1).
      this.dummyHash ??= hashPassword('timing-equalizer-not-a-real-password');
      await verifyPassword(await this.dummyHash, input.password);
      throw new AppError('INVALID_CREDENTIALS');
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) throw new AppError('INVALID_CREDENTIALS');

    await this.revokePrevious(previousToken);
    const token = newSessionToken();
    const expiresAt = this.expiry();
    await this.sessions.create({ id: hashSessionToken(token), userId: user.id, expiresAt });
    return { user: toUserDto(user), token, expiresAt };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.delete(hashSessionToken(token));
  }

  /** Trả AuthContext nếu phiên hợp lệ; phiên hết hạn bị xoá ngay (§A5.2). */
  async resolveSession(token: string): Promise<AuthContext | null> {
    const id = hashSessionToken(token);
    const session = await this.sessions.findWithUser(id);
    if (!session) return null;
    if (session.expiresAt.getTime() <= this.clock.now().getTime()) {
      await this.sessions.delete(id);
      return null;
    }
    const { user } = session;
    return {
      userId: user.id,
      sessionId: id,
      user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
    };
  }
}
