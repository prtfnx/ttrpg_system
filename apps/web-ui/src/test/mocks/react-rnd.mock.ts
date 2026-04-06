import React from 'react';

export const Rnd = React.forwardRef<HTMLDivElement, any>(
  ({ children, className, style }: any, ref) =>
    React.createElement('div', { ref, className, style }, children)
);
