// src/components/Card.tsx
import React from "react";

export function Card({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`rounded-xl shadow-sm border border-gray-200 bg-white p-4 ${className}`}>
      {children}
    </div>
  );
}
