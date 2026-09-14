import Image from 'next/image';

type OrbitMarkProps = {
  className?: string;
};

export function OrbitMark({ className }: OrbitMarkProps) {
  return (
    <Image className={className} src="/orbit-mark-v5-96.png" alt="" width={38} height={38} priority unoptimized aria-hidden="true" />
  );
}
