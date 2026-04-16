import { useEffect, useState } from "react";

export interface ResourceState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isRefreshing: boolean;
  reload: () => void;
}

export interface UseResourceOptions {
  enabled?: boolean;
}

export function useResource<T>(
  loader: () => Promise<T>,
  dependencies: ReadonlyArray<unknown>,
  options?: UseResourceOptions
): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const isEnabled = options?.enabled ?? true;

  useEffect(() => {
    let isActive = true;

    if (!isEnabled) {
      setError(null);
      if (data === null) {
        setIsLoading(true);
      }
      setIsRefreshing(false);

      return () => {
        isActive = false;
      };
    }

    async function run() {
      setError(null);
      if (data === null) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const nextData = await loader();
        if (!isActive) {
          return;
        }

        setData(nextData);
      } catch (nextError) {
        if (!isActive) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError
            : new Error("Failed to load resource.")
        );
      } finally {
        if (!isActive) {
          return;
        }

        setIsLoading(false);
        setIsRefreshing(false);
      }
    }

    run();

    return () => {
      isActive = false;
    };
  }, [isEnabled, ...dependencies, reloadKey]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    reload: () => setReloadKey((currentValue) => currentValue + 1),
  };
}
