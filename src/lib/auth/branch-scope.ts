import type { CurrentAccess } from './authorization'

export const EMPTY_BRANCH_ID = '00000000-0000-0000-0000-000000000000'

export function resolveBranchFilter(access: CurrentAccess | null, requested?: string | null) {
  if (!access || access.isAdmin) return requested || null
  if (access.branchIds.length === 0) return EMPTY_BRANCH_ID
  if (requested && access.branchIds.includes(requested)) return requested
  if (access.branchIds.length === 1) return access.branchIds[0]
  return null
}

export function applyBranchScope(
  query: any,
  access: CurrentAccess | null,
  requested?: string | null,
  column = 'sube_id',
) {
  if (!access || access.isAdmin) {
    return requested ? query.eq(column, requested) : query
  }

  const branchId = resolveBranchFilter(access, requested)
  if (branchId) return query.eq(column, branchId)
  return query.in(column, access.branchIds.length > 0 ? access.branchIds : [EMPTY_BRANCH_ID])
}

export function filterVisibleBranches<T extends { id: string }>(branches: T[], access: CurrentAccess | null) {
  if (!access || access.isAdmin) return branches
  return branches.filter(branch => access.branchIds.includes(branch.id))
}

export function getLockedBranchId(access: CurrentAccess | null) {
  return access?.singleBranchId ?? null
}
