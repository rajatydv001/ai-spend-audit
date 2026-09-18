import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import LandingContent from "@/components/landing-content";
import { getSessionUser } from "@/lib/auth/dal";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar user={user ?? undefined} />

      <LandingContent />

      <Footer />
    </main>
  );
}