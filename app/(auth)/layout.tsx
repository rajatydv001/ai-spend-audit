import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-white">
      <div className="mb-8 flex items-center gap-3">
        <div className="h-3 w-3 rounded-full bg-green-400" />
        <span className="text-lg font-bold">AI Spend Audit</span>
      </div>

      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        {children}
      </div>

      <p className="mt-8 text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-300">
          &larr; Back to home
        </Link>
      </p>
    </main>
  );
}
