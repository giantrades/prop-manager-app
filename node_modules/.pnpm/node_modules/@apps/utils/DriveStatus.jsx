// packages/ui/DriveStatus.jsx
import React from "react";
import {useDrive} from "@apps/state/DriveContext";
import { DriveProvider } from "@apps/state/DriveContext";

export default function DriveStatus() {
const { DriveProvider, useDrive } = Drive;
  const { ready, logged, login, logout } = useDrive();

  const color = !ready
    ? "bg-gray-500"
    : logged
    ? "bg-green-500"
    : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-3 rounded-full ${color}`} />
      {logged ? (
        <button
          className="btn ghost small"
          onClick={logout}
          title="Desconectar do Google Drive"
        >
          Desconectar
        </button>
      ) : (
        <button
          className="btn ghost small"
          onClick={login}
          title="Conectar ao Google Drive"
        >
          Conectar
        </button>
      )}
    </div>
  );
}
