import { useMemo, useState } from "react";
import { DICT, Lang } from "./dict";

export function useI18n() {
  const [lang, setLang] = useState<Lang>("zh");
  const t = useMemo(() => {
    const table = DICT[lang];
    return (key: string) => table[key] ?? key;
  }, [lang]);

  return { lang, setLang, t };
}
