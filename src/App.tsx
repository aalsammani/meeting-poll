import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider, RequireAuth } from "./components/useAuth";
import CreatePoll from "./pages/CreatePoll";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import OrganizerLogin from "./pages/OrganizerLogin";
import OrganizerPolls from "./pages/OrganizerPolls";
import PollAdmin from "./pages/PollAdmin";
import PollPage from "./pages/PollPage";
import Privacy from "./pages/Privacy";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="p/:pollId" element={<PollPage />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="organizer" element={<OrganizerLogin />} />
            <Route path="organizer/polls" element={<RequireAuth><OrganizerPolls /></RequireAuth>} />
            <Route path="organizer/polls/new" element={<RequireAuth><CreatePoll /></RequireAuth>} />
            <Route path="organizer/polls/:pollId" element={<RequireAuth><PollAdmin /></RequireAuth>} />
            <Route path="organizer/*" element={<Navigate to="/organizer/polls" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
