import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erreur non interceptée dans l'application :", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-sm">
            <h1 className="text-base font-semibold text-slate-800 mb-2">
              Une erreur est survenue
            </h1>
            <p className="text-slate-600 mb-3">
              L'application a rencontré un problème inattendu. Rechargez la
              page ; si le problème persiste, vérifiez la configuration
              (variables d'environnement, projet Firebase).
            </p>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-red-700">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
