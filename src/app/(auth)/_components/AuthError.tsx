export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        color: "#991b1b",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {message}
    </div>
  );
}
