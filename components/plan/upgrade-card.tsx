import Link from "next/link";

export default function UpgradeCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
      <p className="text-2xl">🔒</p>
      <h2 className="mt-4 text-xl font-bold text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">{description}</p>
      <Link
        href="/dashboard/billing"
        className="mt-6 inline-block rounded-2xl bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-80"
      >
        Upgrade to Pro
      </Link>
    </div>
  );
}