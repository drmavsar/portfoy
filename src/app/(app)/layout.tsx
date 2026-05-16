import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <div className="flex-1 p-8 max-w-screen-2xl w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}
