import { useEffect } from "react";

export default function DialogAccessibility() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let restore: HTMLElement | null = null;
    const sync = () => {
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      );
      if (dialog === current) return;
      if (!dialog) {
        document.body.style.overflow = "";
        restore?.focus();
        current = null;
        return;
      }
      if (!current) restore = document.activeElement as HTMLElement;
      current = dialog;
      document.body.style.overflow = "hidden";
      if (!dialog.contains(document.activeElement))
        dialog
          .querySelector<HTMLElement>(
            'input,button,select,textarea,[tabindex="0"]',
          )
          ?.focus();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === "Escape") {
        const close =
          current.querySelector<HTMLButtonElement>(
            'button[aria-label^="Close"]',
          ) ||
          [...current.querySelectorAll<HTMLButtonElement>("button")].find(
            (button) => button.textContent?.trim() === "Cancel",
          );
        close?.click();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [
        ...current.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ].filter((item) => item.getClientRects().length);
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", keydown);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = "";
    };
  }, []);
  return null;
}
