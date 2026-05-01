import React from 'react';

export const Rnd = React.forwardRef<HTMLDivElement, { children?: React.ReactNode; className?: string; style?: React.CSSProperties; [key: string]: unknown }>(
  ({ children, className, style }, ref) =>
    React.createElement('div', { ref, className, style }, children as React.ReactNode)
);
