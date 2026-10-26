import { useCallback, useRef } from "react";

// One idempotency key per attempt at a write, e.g. per Pre-order being fulfilled. A retry after
// an error reuses the key, so the server returns the first result instead of writing twice; the
// key is dropped once the attempt succeeds.
export function useIdempotencyKeys() {
  const keysRef = useRef(new Map<string, string>());

  const keyFor = useCallback((attemptId: string) => {
    const existingKey = keysRef.current.get(attemptId);
    if (existingKey) return existingKey;
    const newKey = crypto.randomUUID();
    keysRef.current.set(attemptId, newKey);
    return newKey;
  }, []);

  const clearKey = useCallback((attemptId: string) => {
    keysRef.current.delete(attemptId);
  }, []);

  return { keyFor, clearKey };
}
