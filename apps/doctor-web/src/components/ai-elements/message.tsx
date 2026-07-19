"use client";

import { cn } from "@/lib/utils";
import { memo, type ComponentProps } from "react";
import { Streamdown } from "streamdown";

/* Installed from AI Elements' message component and intentionally reduced to
 * the only primitive this report chat uses. Diagram, code, math, branching,
 * action, and tooltip plugins would add a large unused client bundle here. */
export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      {...props}
    />
  ),
  (previous, next) =>
    previous.children === next.children &&
    previous.isAnimating === next.isAnimating
);

MessageResponse.displayName = "MessageResponse";
