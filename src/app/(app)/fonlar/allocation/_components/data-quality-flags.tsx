import type { AllocationFlag } from "@/app/(app)/_lib/tefas/allocation-types";
import { flagSeverityStyle } from "@/app/(app)/_lib/tefas/allocation-ui-helpers";

export function DataQualityFlags({ flags }: { flags: AllocationFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {flags.map((f, i) => {
        const s = flagSeverityStyle(f.level);
        return (
          <div
            key={`${f.level}-${i}`}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "8px 12px",
              borderRadius: 6,
              background: s.bg,
              color: s.fg,
              fontSize: 12,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{s.icon}</span>
            <span>{f.message}</span>
          </div>
        );
      })}
    </div>
  );
}
