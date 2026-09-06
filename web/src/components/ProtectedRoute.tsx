import { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import AccessGate from "./AccessGate";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Chargement…</div>;
  }
  if (!user) {
    return <AccessGate />;
  }
  return <>{children}</>;
}
