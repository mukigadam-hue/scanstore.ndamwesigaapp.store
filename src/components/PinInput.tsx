import { useRef, useEffect } from "react";

interface Props {
  length: number;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  id?: string;
}

export function PinInput({ length, value, onChange, autoFocus, id }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const digits = value.padEnd(length, " ").split("").slice(0, length);

  const setDigit = (i: number, d: string) => {
    const next = value.split("");
    while (next.length < length) next.push("");
    next[i] = d;
    const joined = next.join("").trimEnd();
    onChange(joined.slice(0, length));
  };

  return (
    <div className="flex gap-2 justify-center" id={id}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="tel"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d.trim()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            setDigit(i, v);
            if (v && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              if (digits[i].trim()) {
                setDigit(i, "");
              } else if (i > 0) {
                refs.current[i - 1]?.focus();
                setDigit(i - 1, "");
              }
              e.preventDefault();
            } else if (e.key === "ArrowLeft" && i > 0) {
              refs.current[i - 1]?.focus();
            } else if (e.key === "ArrowRight" && i < length - 1) {
              refs.current[i + 1]?.focus();
            }
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData
              .getData("text")
              .replace(/\D/g, "")
              .slice(0, length);
            if (pasted) {
              onChange(pasted);
              const focusIdx = Math.min(pasted.length, length - 1);
              setTimeout(() => refs.current[focusIdx]?.focus(), 0);
              e.preventDefault();
            }
          }}
          className="w-11 h-12 text-center text-xl font-semibold rounded-md border-2 border-border bg-input text-foreground focus:border-primary focus:outline-none transition-colors"
        />
      ))}
    </div>
  );
}
