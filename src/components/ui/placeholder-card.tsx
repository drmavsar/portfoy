interface PlaceholderCardProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function PlaceholderCard({ title, description, children }: PlaceholderCardProps) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <header className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-xs text-[color:var(--muted)]">{description}</p>
        )}
      </header>
      <div className="text-sm text-[color:var(--muted)]">
        {children ?? "Tasarım hazır olduğunda bu alan doldurulacak."}
      </div>
    </div>
  );
}
