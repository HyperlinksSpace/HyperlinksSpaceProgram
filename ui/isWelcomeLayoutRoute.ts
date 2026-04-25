/**
 * Matches `GlobalLogoBar` welcome detection: marketing / TMA immersive header vs default home bar.
 * Keep in sync when changing route or auth gating for the welcome shell.
 */
export function isWelcomeLayoutRoute(
  pathname: string | null | undefined,
  auth: { authHydrated: boolean; authReady: boolean; isAuthenticated: boolean },
): boolean {
  const isRootPath =
    pathname === "/" || pathname === "" || pathname === null;
  return (
    pathname === "/welcome" ||
    (isRootPath && auth.authHydrated && auth.authReady && !auth.isAuthenticated) ||
    (pathname === "/home" && auth.authHydrated && auth.authReady && !auth.isAuthenticated)
  );
}
