import { cn } from "@/lib/cn";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "footer" | "nav" | "header";
}

/**
 * Global layout container: 1440px max, 20/32/48/64px horizontal padding
 * across mobile, tablet, desktop and large desktop.
 */
export default function Container({
  children,
  className,
  as: Tag = "div",
}: ContainerProps) {
  return (
    <Tag
      className={cn(
        "mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12 2xl:px-16",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
