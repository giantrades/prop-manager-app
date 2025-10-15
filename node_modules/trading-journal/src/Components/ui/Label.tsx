// src/components/Label.tsx
export function Label({ children, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...rest} className={`block mb-1 font-medium ${rest.className ?? ""}`}>{children}</label>;
}
