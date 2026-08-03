import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Oturumu doğrula (getUser her zaman server'a gider, güvenlidir)
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'
  const isApiRequest = pathname.startsWith('/api/')

  // Giriş yapmamış kullanıcı
  if (!user && !isLoginPage) {
    // API isteği HTML login sayfasına YÖNLENDİRİLMEZ. Yönlendirme, fetch
    // tarafından şeffafça izlendiği için istemciye 200 + `text/html` olarak
    // ulaşıyordu; `response.json()` çağıran her çağrı bunu
    // "Unexpected token '<' … is not valid JSON" olarak görüyordu. Oturum
    // süresi dolan bir fatura yüklemesi böylece anlamsız bir hataya dönüşüyordu.
    // Artık her API yolu ortak JSON zarfını korur.
    if (isApiRequest) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.',
            retryable: false,
          },
          requestId: 'proxy',
        },
        { status: 401, headers: { 'cache-control': 'no-store' } },
      )
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Giriş yapmış kullanıcı /login'e gelirse dashboard'a yönlendir
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // /yonetim/* → sadece Admin rolü
  if (user && pathname.startsWith('/yonetim')) {
    const { data: profil } = await supabase
      .from('kullanici_profiller')
      .select('roller(ad)')
      .eq('id', user.id)
      .single()

    if ((profil?.roller as any)?.ad !== 'Admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/yetkisiz'
      return NextResponse.redirect(url)
    }
  }

  // /fabrika/* → Admin veya Fabrika rolü
  if (user && pathname.startsWith('/fabrika')) {
    const { data: profil } = await supabase
      .from('kullanici_profiller')
      .select('roller(ad)')
      .eq('id', user.id)
      .single()

    const rolAd = (profil?.roller as any)?.ad
    if (rolAd !== 'Admin' && rolAd !== 'Fabrika') {
      const url = request.nextUrl.clone()
      url.pathname = '/yetkisiz'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
