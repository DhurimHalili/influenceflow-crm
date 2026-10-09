import { useEffect, useRef } from "react";

// Runs `save` when the component unmounts with unsaved changes — leaving a
// profile mid-edit keeps what was typed instead of silently dropping it.
export function useSaveOnLeave(dirty: boolean, save: () => void) {
  const latest = useRef({ dirty, save });
  latest.current = { dirty, save };
  useEffect(
    () => () => {
      if (latest.current.dirty) latest.current.save();
    },
    [],
  );
}
