import { Fragment } from "react";
import { Icon } from "@/components/Icon";
import { DEFAULT_WIZARD_STEPS } from "./types";

type Props = {
  /** Paso actual (1-indexed). */
  step: number;
  items?: readonly string[];
  className?: string;
};

type StepState = "done" | "current" | "todo";

function stepState(index: number, currentStep: number): StepState {
  const idx = index + 1;
  if (idx < currentStep) return "done";
  if (idx === currentStep) return "current";
  return "todo";
}

export function GiveawayWizardSteps({
  step,
  items = DEFAULT_WIZARD_STEPS,
  className,
}: Props) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        flexWrap: "nowrap",
      }}
    >
      {items.map((label, i) => {
        const state = stepState(i, step);
        const idx = i + 1;

        return (
          <Fragment key={label}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 0",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 900,
                  fontSize: 12,
                  background:
                    state === "done"
                      ? "var(--primary)"
                      : state === "current"
                        ? "#0a0a0a"
                        : "var(--muted)",
                  color: state === "todo" ? "var(--muted-fg)" : "#fff",
                  border: state === "current" ? "2px solid var(--primary)" : "none",
                }}
              >
                {state === "done" ? (
                  <Icon name="check" size={12} color="#fff" />
                ) : (
                  idx
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: state === "todo" ? "var(--muted-fg)" : "var(--fg)",
                }}
              >
                {label}
              </div>
            </div>

            {i < items.length - 1 ? (
              <div
                style={{
                  flex: 1,
                  height: 1.5,
                  background: state === "done" ? "var(--primary)" : "var(--border)",
                  margin: "0 12px",
                }}
              />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
