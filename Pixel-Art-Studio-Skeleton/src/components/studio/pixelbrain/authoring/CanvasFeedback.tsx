import { useEffect, useRef } from "react";

export type CanvasFeedbackTone = "info" | "warning" | "danger" | "neutral";

export type CanvasFeedbackMessage = {
  id: string;
  tone: CanvasFeedbackTone;
  text: string;
};

type CanvasFeedbackProps = {
  message: CanvasFeedbackMessage | null;
  onExpire?: () => void;
  expireMs?: number;
};

export function CanvasFeedback({ message, onExpire, expireMs = 4000 }: CanvasFeedbackProps) {
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => expireRef.current?.(), expireMs);
    return () => window.clearTimeout(timer);
  }, [message, expireMs]);

  return (
    <div
      className={message ? `pbs-canvas-feedback is-${message.tone}` : "pbs-canvas-feedback"}
      data-testid="canvas-feedback"
      data-tone={message?.tone || ""}
    >
      <p aria-live="polite">{message?.text ?? ""}</p>
    </div>
  );
}
