import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Make My Marriage home">
      <Image src="/brand/logo-mark.svg" alt="" width={44} height={44} />
      <span>
        <strong>Make My Marriage</strong>
        <small>WEDDING PLANNING, TOGETHER</small>
      </span>
    </Link>
  );
}
