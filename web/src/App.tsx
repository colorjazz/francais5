import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Corpus from "./pages/Corpus";
import Notes from "./pages/Notes";
import Exam from "./pages/Exam";
import Results from "./pages/Results";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/connexion" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dossier"
          element={
            <ProtectedRoute>
              <Layout>
                <Corpus />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes"
          element={
            <ProtectedRoute>
              <Layout>
                <Notes />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/examen"
          element={
            <ProtectedRoute>
              <Layout>
                <Exam />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/resultats"
          element={
            <ProtectedRoute>
              <Layout>
                <Results />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
