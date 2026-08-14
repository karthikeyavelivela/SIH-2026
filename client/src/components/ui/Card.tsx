import { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-surface rounded-2xl p-5 shadow-sm border border-black/5 ${className}`}
      {...props}
    />
  );
}
