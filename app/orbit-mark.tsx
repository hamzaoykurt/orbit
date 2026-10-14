import Image from 'next/image';

type OrbitMarkProps = {
  className?: string;
};

export function OrbitMark({ className }: OrbitMarkProps) {
  return (
    <>
      <Image className={`orbit-mark-light ${className ?? ''}`} src="/orbit-mark-v8-96.png" alt="" width={38} height={38} priority unoptimized aria-hidden="true" />
      <Image className={`orbit-mark-dark ${className ?? ''}`} src="/orbit-mark-dark-v8-96.png" alt="" width={38} height={38} priority unoptimized aria-hidden="true" />
    </>
  );
}
