import { cn } from "@/lib/utils";

/** Premium shimmer skeleton bar — uses gradient shimmer, not pulse */
function Bone({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md bg-muted animate-shimmer", className)}
      {...props}
    />
  );
}

/** Dashboard skeleton: 5 KPI cards + 2 charts + 2 bottom panels */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Bone className="h-7 w-48" />
          <Bone className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-8 w-28 rounded-lg" />
          <Bone className="h-8 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
            <Bone className="w-12 h-12 rounded-xl" />
            <div className="space-y-2 flex-1">
              <Bone className="h-7 w-12" />
              <Bone className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <Bone className="h-5 w-32 mb-4" />
          <Bone className="h-48 w-full rounded-lg" />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <Bone className="h-5 w-32 mb-4" />
          <Bone className="h-48 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Entity list skeleton: header + filter bar + grid of entity cards */
export function ListSkeleton({ columns = 3, count = 6 }: { columns?: number; count?: number }) {
  const gridCols = columns === 2 ? "md:grid-cols-2" : columns === 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2";
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Bone className="h-7 w-40" />
          <Bone className="h-4 w-28" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-8 w-20 rounded-lg" />
          <Bone className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-3">
        <Bone className="h-9 flex-1 max-w-md rounded-lg" />
        <Bone className="h-9 w-[140px] rounded-lg" />
        <Bone className="h-9 w-9 rounded-lg" />
      </div>
      <div className={cn("grid grid-cols-1 gap-4", gridCols)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Bone className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Bone className="h-4 w-32" />
                  <Bone className="h-3 w-24" />
                </div>
                <Bone className="h-5 w-16 rounded-full" />
              </div>
              <div className="space-y-1.5">
                <Bone className="h-3 w-full" />
                <Bone className="h-3 w-3/4" />
              </div>
            </div>
            <div className="px-4 py-2.5 border-t border-border/50">
              <div className="flex items-center gap-2">
                <Bone className="h-3 w-16" />
                <Bone className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Detail page skeleton: breadcrumb + header + tabs + content */
export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Bone className="h-4 w-20" />
        <Bone className="h-4 w-4" />
        <Bone className="h-4 w-32" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bone className="h-8 w-48" />
          <Bone className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-8 w-24 rounded-lg" />
          <Bone className="h-8 w-32 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2">
        <Bone className="h-6 w-24 rounded-full" />
        <Bone className="h-6 w-20 rounded-full" />
      </div>
      <Bone className="h-10 w-64 rounded-lg" />
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="space-y-3">
          <Bone className="h-6 w-48" />
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-3/4" />
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-1/2" />
        </div>
      </div>
    </div>
  );
}

/** Kanban skeleton: 5 columns with cards */
export function KanbanSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Bone className="h-7 w-24" />
          <Bone className="h-4 w-20" />
        </div>
        <Bone className="h-8 w-20 rounded-lg" />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3, 4, 5].map((col) => (
          <div key={col} className="min-w-[280px] bg-muted/30 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between px-1">
              <Bone className="h-4 w-20" />
              <Bone className="h-5 w-5 rounded" />
            </div>
            {[1, 2].map((card) => (
              <div key={card} className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Bone className="h-4 w-full" />
                <Bone className="h-3 w-3/4" />
                <div className="flex items-center gap-2 pt-1">
                  <Bone className="h-5 w-14 rounded-full" />
                  <Bone className="h-5 w-5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Organogram skeleton */
export function OrgSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Bone className="h-7 w-36" />
        <div className="flex gap-2">
          <Bone className="h-9 w-48 rounded-lg" />
          <Bone className="h-9 w-28 rounded-lg" />
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-8 min-h-[500px] flex flex-col items-center">
        {/* CEO card */}
        <Bone className="h-24 w-64 rounded-xl" />
        <Bone className="h-8 w-px" />
        <Bone className="h-px w-96" />
        <div className="flex gap-8 mt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Bone className="h-8 w-px" />
              <Bone className="h-20 w-56 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { Bone };
