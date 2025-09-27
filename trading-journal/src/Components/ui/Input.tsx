// src/components/Input.tsx
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`border rounded px-3 py-2 ${props.className ?? ""}`} />;
}
