"use client";
import { useEffect, useRef } from "react";

const stack: HTMLElement[] = [];
export function useDialog<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    stack.push(panel);
    const focusable = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length);
    (focusable()[0] ?? panel).focus();
    const handle = (event: KeyboardEvent) => {
      if (stack.at(-1) !== panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0] ?? panel;
      const last = items.at(-1) ?? panel;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handle, true);
    return () => {
      stack.splice(stack.indexOf(panel), 1);
      document.removeEventListener("keydown", handle, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return ref;
}
