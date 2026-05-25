import { useEffect, useRef, useState } from "react";
import { fetchSwapAmount } from "./fetchSwapAmount";

export function useSwapAmount() {
  const [sellAmount, setSellAmount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void fetchSwapAmount().then((result) => {
      if (cancelled || !mountedRef.current) return;
      if (result.ok) {
        setSellAmount(result.sellAmount);
        setError(null);
      } else {
        setSellAmount(null);
        setError(result.error);
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { sellAmount, isLoading, error };
}
