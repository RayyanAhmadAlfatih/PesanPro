import Image from "next/image";

export function PesanProIcon({
  className = "",
  priority = false,
  alt = "PesanPro",
}: {
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <Image
      src="/brand/pesanpro-icon.webp"
      alt={alt}
      width={256}
      height={256}
      priority={priority}
      className={className}
    />
  );
}

export function PesanProLogo({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/pesanpro-logo.webp"
      alt="PesanPro"
      width={444}
      height={148}
      priority={priority}
      className={className}
    />
  );
}
