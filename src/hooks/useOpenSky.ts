import { useCallback, useRef } from "react";
import { View } from "react-native";
import { router } from "expo-router";

export function useOpenSky(id: string, date?: string) {
  const moonRef = useRef<View>(null);
  const openSky = useCallback(() => {
    const open = (x?: number, y?: number, width?: number) => router.push({
      pathname: "/sky/[id]",
      params: { id, ...(date ? { date } : {}), focus: "moon",
        ...(width && width > 0 ? { x: String(x), y: String(y), size: String(width) } : {}),
      },
    });
    if (moonRef.current) moonRef.current.measureInWindow((x, y, width) => open(x, y, width));
    else open();
  }, [id, date]);
  return { moonRef, openSky };
}
