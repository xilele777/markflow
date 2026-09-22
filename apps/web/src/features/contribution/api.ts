// contribution 接口函数（《接口层.md》§三）。路径对齐《接口文档.md》getMyContribution。
import { post } from '@/shared/api/http';
import type { ContributionResponse, GetMyContributionRequest } from './types';

/** 我的贡献 · POST /api/user/getMyContribution。
 *  鉴权：本人查自己 / SA 查任意 / 当前空间 LABEL_ADMIN 查空间成员；其它由后端返 PERMISSION_DENIED。 */
export function getMyContribution(req: GetMyContributionRequest): Promise<ContributionResponse> {
  return post<ContributionResponse>('/user/getMyContribution', req);
}
