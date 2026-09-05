import { useEffect } from "react";
import { Header } from "@/components/studio/Header";
import { Inspector } from "@/components/studio/Inspector";
import { Library } from "@/components/studio/Library";
import { Stage } from "@/components/studio/Stage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStudio } from "@/lib/studio-store";
import { Toaster } from "sonner";

export function Studio() {
  const hydrate = useStudio((s) => s.hydrate);
  const grow = useStudio((s) => s.grow);
  const ready = useStudio((s) => s.ready);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) hydrate();
    };
    void Promise.resolve(useStudio.persist.rehydrate()).then(run);
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        grow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grow]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh flex-col bg-bg text-fg">
        <Header />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(16rem,18rem)_minmax(0,1fr)_minmax(14rem,16rem)]">
          <main className="flex min-h-[28rem] min-w-0 flex-col lg:order-2 lg:min-h-0">
            {ready ? (
              <Stage />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">
                Growing a field…
              </div>
            )}
          </main>
          <div className="border-t border-border lg:order-1 lg:border-t-0 lg:border-r">
            <Inspector />
          </div>
          <div className="border-t border-border lg:order-3 lg:border-l">
            <Library />
          </div>
        </div>
      </div>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#141712",
            color: "#e8ebe4",
            border: "1px solid rgba(232,235,228,0.12)",
          },
        }}
      />
    </TooltipProvider>
  );
}
