import { createContext, useContext, useMemo, useState } from 'react';

import {
  getRuntimeOptions,
  mobileAppEnvironment,
  type MobileRuntimeKind,
  type RuntimeOption
} from '../config/env.ts';

interface RuntimeModeContextValue {
  runtimeKind: MobileRuntimeKind;
  runtimeOptions: RuntimeOption[];
  selectRuntimeKind: (runtimeKind: MobileRuntimeKind) => void;
}

const RuntimeModeContext = createContext<RuntimeModeContextValue | undefined>(undefined);

export function RuntimeModeProvider(props: { children: React.ReactNode }) {
  const [runtimeKind, setRuntimeKind] = useState<MobileRuntimeKind>(mobileAppEnvironment.defaultRuntimeKind);
  const runtimeOptions = useMemo(
    () => getRuntimeOptions(mobileAppEnvironment),
    []
  );

  return (
    <RuntimeModeContext.Provider
      value={{
        runtimeKind,
        runtimeOptions,
        selectRuntimeKind: setRuntimeKind
      }}
    >
      {props.children}
    </RuntimeModeContext.Provider>
  );
}

export function useRuntimeMode() {
  const context = useContext(RuntimeModeContext);
  if (!context) {
    throw new Error('useRuntimeMode must be used inside RuntimeModeProvider.');
  }

  return context;
}
