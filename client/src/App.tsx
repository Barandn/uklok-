import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import RouteOptimization from "./pages/RouteOptimization";
import Vessels from "./pages/Vessels";
import { useAuth } from "./_core/hooks/useAuth";
import { Ship, Navigation as NavigationIcon, Loader2 } from "lucide-react";

function Navigation() {
  const [location] = useLocation();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <nav className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/">
              <a className="flex items-center gap-2 text-xl font-bold text-blue-600 hover:text-blue-700">
                <Ship className="w-6 h-6" />
                GreenShip AI
              </a>
            </Link>
            <div className="flex gap-4">
              <Link href="/">
                <a
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    location === "/"
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <NavigationIcon className="w-4 h-4" />
                  Rota Optimizasyonu
                </a>
              </Link>
              <Link href="/vessels">
                <a
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    location === "/vessels"
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Ship className="w-4 h-4" />
                  Gemiler
                </a>
              </Link>
            </div>
          </div>
          {user ? (
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{user.name || user.email || "Misafir"}</span>
              <span className="text-xs text-gray-400">Otomatik giriş</span>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

function Router() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={RouteOptimization} />
      <Route path="/vessels" component={Vessels} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Navigation />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
