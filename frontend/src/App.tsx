import { Route, Routes } from "react-router";
import { AuthProvider } from "./auth/AuthProvider";
import { GuestOnly, RequireAuth } from "./auth/guards";
import { AppLayout } from "./components/AppLayout";
import { ToastProvider } from "./components/ToastProvider";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";
import { HomePage, MyDocumentsPage } from "./pages/DocumentListPages";
import { EditDocumentPage } from "./pages/EditDocumentPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { UploadPage } from "./pages/UploadPage";
import { ThemeProvider } from "./theme/ThemeProvider";

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="documents/:id" element={<DocumentDetailPage />} />
              <Route element={<GuestOnly />}>
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
              </Route>
              <Route element={<RequireAuth />}>
                <Route path="me/documents" element={<MyDocumentsPage />} />
                <Route path="upload" element={<UploadPage />} />
                <Route path="documents/:id/edit" element={<EditDocumentPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
