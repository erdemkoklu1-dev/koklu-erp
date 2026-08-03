import { apiSuccess, newRequestId } from '@/lib/api/response'

/**
 * Dağıtım sürümü ucu (GOREV.md Faz D).
 *
 * Açık kalmış eski sekmeler, kritik bir işlemden önce buradan güncel build kimliğini
 * okuyup kendi kimliğiyle karşılaştırabilir. Böylece "eski asset / eski Server Action
 * kimliği" kaynaklı hatalar kullanıcıya anlaşılır bir "yeni sürüm var" uyarısına
 * dönüşür; otomatik reload döngüsü kurulmaz — yenileme kararı kullanıcınındır.
 */

export const dynamic = 'force-dynamic'

function resolveBuildId(): string {
  return (
    process.env.NEXT_PUBLIC_BUILD_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    'development'
  )
}

export async function GET() {
  const requestId = newRequestId()
  return apiSuccess({ buildId: resolveBuildId(), serverTime: new Date().toISOString() }, requestId)
}
