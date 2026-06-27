import { type NextRequest, NextResponse } from "next/server";

const TV_HOST_RE = /^tv\./;

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";

  if (TV_HOST_RE.test(host)) {
    const { pathname, search } = req.nextUrl;
    // tv.matchpoint.top/[slug]?k=[token]  →  /t/[slug]/live?k=[token]
    const slug = pathname.replace(/^\//, "").split("/")[0];
    if (!slug) return NextResponse.next();
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = `/t/${slug}/live`;
    return NextResponse.rewrite(rewriteUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Excluir archivos estáticos, imágenes, y rutas internas de Next.js.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)",
  ],
};
