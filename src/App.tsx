import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import { AuthProvider } from "@/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import RestaurantsList from "./pages/admin/RestaurantsList";
import RestaurantNew from "./pages/admin/RestaurantNew";
import RestaurantConfig from "./pages/admin/RestaurantConfig";
import RestaurantDashboard from "./pages/restaurant/RestaurantDashboard";
import RestaurantReservations from "./pages/restaurant/RestaurantReservations";
import RestaurantCalendar from "./pages/restaurant/RestaurantCalendar";
import RestaurantHandoff from "./pages/restaurant/RestaurantHandoff";
import RestaurantSettings from "./pages/restaurant/RestaurantSettings";
import RootRedirect from "./pages/RootRedirect";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/auth" element={<Auth />} />

            <Route path="/admin" element={<RoleGuard allow="platform_admin"><AdminDashboard /></RoleGuard>} />
            <Route path="/admin/restaurants" element={<RoleGuard allow="platform_admin"><RestaurantsList /></RoleGuard>} />
            <Route path="/admin/restaurants/new" element={<RoleGuard allow="platform_admin"><RestaurantNew /></RoleGuard>} />
            <Route path="/admin/restaurants/:id" element={<RoleGuard allow="platform_admin"><RestaurantConfig /></RoleGuard>} />

            <Route path="/restaurant" element={<RoleGuard allow="restaurant_admin"><RestaurantDashboard /></RoleGuard>} />
            <Route path="/restaurant/calendar" element={<RoleGuard allow="restaurant_admin"><RestaurantCalendar /></RoleGuard>} />
            <Route path="/restaurant/reservations" element={<RoleGuard allow="restaurant_admin"><RestaurantReservations /></RoleGuard>} />
            <Route path="/restaurant/handoff" element={<RoleGuard allow="restaurant_admin"><RestaurantHandoff /></RoleGuard>} />
            <Route path="/restaurant/settings" element={<RoleGuard allow="restaurant_admin"><RestaurantSettings /></RoleGuard>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
