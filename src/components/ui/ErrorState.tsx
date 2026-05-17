// Error banner for failed API calls. Accepts optional retry handler.
import { Icon } from "@/components/Icon";

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: "16px 18px",
        borderRadius: 10,
        border: "1px solid #fecaca",
        background: "#fef2f2",
        color: "#991b1b",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      <Icon name="alert-triangle" size={16} color="#dc2626" />
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: 11,
            padding: "6px 10px",
          }}
        >
          <Icon name="rotate-ccw" size={11} color="#991b1b" />
          Reintentar
        </button>
      )}
    </div>
  );
}
