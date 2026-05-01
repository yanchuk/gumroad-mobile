import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "email-compose-draft-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Draft = {
  title: string;
  html: string;
  audienceType: string;
  idempotencyKey: string;
  photoCdnUrl?: string;
  savedAt: string;
};

export const useEmailDraft = () => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Draft;
        const age = Date.now() - new Date(parsed.savedAt).getTime();
        if (age <= MAX_AGE_MS) setDraft(parsed);
      } catch {
        // corrupted draft — ignore
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const save = useCallback(async (next: Omit<Draft, "savedAt">) => {
    const draftWithTimestamp = { ...next, savedAt: new Date().toISOString() };
    setDraft(draftWithTimestamp);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draftWithTimestamp));
  }, []);

  const clear = useCallback(async () => {
    setDraft(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { draft, save, clear, isLoaded };
};
