import type { NextRequest } from 'next/server';

export const MOBILE_SIGNUP_COOKIE = 'kortix-mobile-signup';

export async function mobileSignupDigest(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The email carries only a digest; its holder cannot reconstruct the browser cookie. */
export async function hasMobileSignupBinding(request: NextRequest): Promise<boolean> {
  const secret = request.cookies.get(MOBILE_SIGNUP_COOKIE)?.value;
  const digest = request.nextUrl.searchParams.get('mobile_binding');
  return Boolean(secret && digest && (await mobileSignupDigest(secret)) === digest);
}
