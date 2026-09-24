import Image from "next/image";
import { cn } from "@/lib/cn";

interface LogoProps {
  /** Rendered pixel size. The SVG scales, 12 to 512 all look sharp. */
  size?: number;
  className?: string;
}

/**
 * Arcad is Arcadia's constellation companion. This master mark is shared by
 * the landing, dashboard, auth surfaces and installed app.
 */
export default function Logo({ size = 20, className }: LogoProps) {
  return (
    <Image
      src="/brand/arcad-orb-mark.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("block rounded-[18%] object-cover", className)}
    />
  );
}
