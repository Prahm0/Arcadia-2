import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Tone = "dark" | "light";
type Size = "md" | "sm";

interface BaseProps {
  variant?: Variant;
  /** The tone of the surface the button sits on. */
  tone?: Tone;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = BaseProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof BaseProps> & { href?: undefined };
type ButtonAsLink = BaseProps &
  Omit<ComponentPropsWithoutRef<"a">, keyof BaseProps> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const base =
  "inline-flex items-center justify-center gap-2 select-none whitespace-nowrap rounded-[10px] font-medium " +
  "transition-[background-color,color,border-color,transform,opacity] duration-200 ease-[var(--ease-out-expo)] " +
  "hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50";

const sizes: Record<Size, string> = {
  md: "h-12 px-6 text-[15px]",
  sm: "h-10 px-4 text-[14px]",
};

const styles: Record<Tone, Record<Variant, string>> = {
  dark: {
    primary: "bg-white text-black hover:bg-[#ebebeb]",
    secondary:
      "border border-white/15 bg-transparent text-white hover:border-white/30 hover:bg-white/[0.04]",
    ghost: "bg-transparent text-white/80 hover:text-white",
  },
  light: {
    primary: "bg-black text-white hover:bg-ink-700",
    secondary:
      "border border-black/12 bg-transparent text-black hover:border-black/30 hover:bg-black/[0.03]",
    ghost: "bg-transparent text-black/70 hover:text-black",
  },
};

export default function Button(props: ButtonProps) {
  const {
    variant = "primary",
    tone = "dark",
    size = "md",
    className,
    children,
    ...rest
  } = props;

  const classes = cn(base, sizes[size], styles[tone][variant], className);

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest as ButtonAsLink;
    return (
      <Link href={href} className={classes} {...anchor}>
        {children}
      </Link>
    );
  }

  const button = rest as ButtonAsButton;
  return (
    <button type={button.type ?? "button"} className={classes} {...button}>
      {children}
    </button>
  );
}
