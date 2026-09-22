/** UserStatusEnum：NORMAL=0, DISABLED=1 */
export const UserStatus = { NORMAL: 0, DISABLED: 1 } as const;
export type UserStatusCode = (typeof UserStatus)[keyof typeof UserStatus];
