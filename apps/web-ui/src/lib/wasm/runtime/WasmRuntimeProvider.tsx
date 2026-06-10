import { useOptionalProtocol } from '@lib/api';
import React from 'react';
import { WasmRuntime } from './WasmRuntime';
import { WasmRuntimeContext } from './WasmRuntimeContext';
import { setCurrentWasmRuntime } from './currentRuntime';

interface WasmRuntimeProviderProps {
  children: React.ReactNode;
}

export function WasmRuntimeProvider({ children }: WasmRuntimeProviderProps) {
  const runtimeRef = React.useRef<WasmRuntime | null>(null);
  const protocol = useOptionalProtocol()?.protocol ?? null;

  if (!runtimeRef.current) {
    runtimeRef.current = new WasmRuntime();
  }

  React.useEffect(() => {
    runtimeRef.current?.setProtocol(protocol);
  }, [protocol]);

  React.useEffect(() => {
    const runtime = runtimeRef.current;
    setCurrentWasmRuntime(runtime);
    return () => {
      if (runtimeRef.current === runtime) setCurrentWasmRuntime(null);
      runtime?.dispose();
    };
  }, []);

  return (
    <WasmRuntimeContext.Provider value={runtimeRef.current}>
      {children}
    </WasmRuntimeContext.Provider>
  );
}

export default WasmRuntimeProvider;
