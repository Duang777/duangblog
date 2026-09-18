"use client";
// Single-island Go / Python code switcher on BEUI Tabs.
//
// Why one component instead of composing Tabs* inside an .astro file:
// Astro renders each React component used in a template as its own render
// tree, so <TabsContent> would mount outside the <Tabs> context provider and
// throw "Tabs.* must be used inside <Tabs>". Keeping the whole tree here keeps
// provider and consumers in the same React tree.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/beui/tabs";
import { cn } from "@/lib/utils";

type Props = {
  go?: string;
  python?: string;
  goLabel?: string;
  pythonLabel?: string;
  defaultValue?: "go" | "python";
  className?: string;
};

const PRE_CLASS =
  "m-3 mt-4 overflow-x-auto rounded-xl bg-muted/60 p-4 font-mono text-sm leading-6";

export function CodeTabs({
  go = "",
  python = "",
  goLabel = "Go",
  pythonLabel = "Python",
  defaultValue = "go",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card",
        className,
      )}
    >
      <Tabs defaultValue={defaultValue} variant="pill">
        <TabsList className="m-3 mb-0">
          <TabsTrigger value="go">{goLabel}</TabsTrigger>
          <TabsTrigger value="python">{pythonLabel}</TabsTrigger>
        </TabsList>
        <TabsContent value="go">
          <pre className={PRE_CLASS}>
            <code>{go}</code>
          </pre>
        </TabsContent>
        <TabsContent value="python">
          <pre className={PRE_CLASS}>
            <code>{python}</code>
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CodeTabs;
