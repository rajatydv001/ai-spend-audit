import DashboardShell from "@/components/layout/dashboard-shell";
import { getSessionUser } from "@/lib/auth/dal";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
