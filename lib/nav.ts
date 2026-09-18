export type NavUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
} | null;

export type AuthNavItem = {
  href: string;
  label: string;
  kind: "link" | "cta";
};

export function isAuthenticated(user: NavUser): user is Exclude<NavUser, null> {
  return user !== null;
}

export function getAuthNav(user: NavUser): AuthNavItem[] {
  if (isAuthenticated(user)) {
    return [{ href: "/dashboard", label: "Dashboard", kind: "cta" }];
  }
  return [
    { href: "/login", label: "Sign in", kind: "link" },
    { href: "/signup", label: "Sign up", kind: "cta" },
  ];
}