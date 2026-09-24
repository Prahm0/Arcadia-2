import Image from "next/image";
import { cn } from "@/lib/cn";

interface LogoProps {
  /** Rendered pixel size. The SVG scales, 12 to 512 all look sharp. */
  size?: number;
  className?: string;
}

/**
 * The official Arcadia mark. It is a supplied raster asset so the landing,
 * dashboard, auth surfaces and installed app all use the exact same logo.
 */
export default function Logo({ size = 20, className }: LogoProps) {
  return (
    <Image
      src="/brand/arcadia-mark.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("block rounded-[18%] object-cover", className)}
    />
  );
}
