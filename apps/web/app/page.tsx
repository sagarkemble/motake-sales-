import { api } from "~/trpc/server";

export default async function Home() {
  const { status } = await api.health.getHealth.query();
  return (
    <main className="min-h-screen">
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Motake Service Test Grid</h1>
        <p className="text-sm text-muted-foreground">Health check: {status}</p>
      </div>
    </main>
  );
}
