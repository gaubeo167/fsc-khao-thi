"use client";

import { useEffect, useMemo, useRef } from "react";

export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const handle = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const call = (...args: Args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fnRef.current(...args), delay);
    };

    call.flush = (...args: Args) => {
      if (timer) clearTimeout(timer);
      fnRef.current(...args);
    };

    call.cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    return call;
  }, [delay]);

  useEffect(() => () => handle.cancel(), [handle]);

  return handle;
}
