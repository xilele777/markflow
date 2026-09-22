/** 当前操作者（来自 JWT）：对应 Java UserContext.UserInfo 的 userId / username。 */
export interface Operator {
  userId: number;
  username: string;
}
