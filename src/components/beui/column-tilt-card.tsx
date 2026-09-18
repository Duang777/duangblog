"use client";
// 首页的专栏入口卡片，外层用 BEUI 的 TiltCard，要展示的内容以 props 传进来。
//
// 内容不放进 Astro 的 slot：Astro 把 React 岛屿的 slot 子节点以原始 HTML 塞进
// <astro-slot>，同时丢掉 class 属性，所以用 slot 拼出来的岛屿既拿不到父组件的
// context，也没法沿用同一套样式。传 props 能让每个岛屿自己闭合。

import { TiltCard } from "@/components/beui/tilt-card";
import { cn } from "@/lib/utils";

type Props = {
  /** 卡片上方的小标签，例如：专栏。留空则不渲染这一行。 */
  kicker?: string;
  title: string;
  intro: string;
  href: string;
  /** 底部那行提示，跟站内其他专栏入口保持一致。 */
  enterLabel?: string;
};

export function ColumnTiltCard({ kicker, title, intro, href, enterLabel }: Props) {
  return (
    <TiltCard max={6} glare={false} className="border border-border bg-card">
      {/* h-full + flex-col：网格会把两张卡片拉到同高，标题和正文贴着上边，
          底部提示用 mt-auto 顶下去，不至于在卡片下方留一大块空白。 */}
      <a href={href} className="flex h-full flex-col p-6">
        {kicker ? (
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {kicker}
          </div>
        ) : null}
        <div className={cn("font-serif text-xl text-foreground", kicker && "mt-2")}>
          {title}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{intro}</p>
        {enterLabel ? (
          <span className="mt-auto pt-8 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {enterLabel}
          </span>
        ) : null}
      </a>
    </TiltCard>
  );
}

export default ColumnTiltCard;
