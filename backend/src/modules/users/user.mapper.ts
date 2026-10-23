/** UserDto theo ARCHITECTURE §A7.4 — chỉ trả cho chính người dùng. */
export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export function toUserDto(user: { id: string; email: string; displayName: string; createdAt: Date }): UserDto {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt.toISOString() };
}
