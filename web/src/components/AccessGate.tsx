export default function AccessGate() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white shadow-sm border border-slate-200 rounded-xl p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-800 mb-2">
          Accès requis via le tableau de bord
        </h1>
        <p className="text-sm text-slate-500">
          Cette application s'utilise uniquement depuis le tableau de bord
          Corrige.moi. Connecte-toi là-bas avec ton code d'accès : tu seras
          redirigé·e automatiquement ici.
        </p>
      </div>
    </div>
  );
}
