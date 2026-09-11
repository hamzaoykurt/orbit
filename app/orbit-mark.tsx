import Image from 'next/image';

type OrbitMarkProps = {
  className?: string;
};

export function OrbitMark({ className }: OrbitMarkProps) {
  return (
    <Image className={className} src="/orbit-icon-v2-192.png" alt="" width={38} height={38} priority aria-hidden="true" />
  );
}
