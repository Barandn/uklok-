import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import RouteOptimization from "./pages/RouteOptimization";
import Vessels from "./pages/Vessels";
import { useAuth } from "./_core/hooks/useAuth";
import { getLoginUrl } from "./const";
import { Button } from "./components/ui/button";
import { Ship, Navigation as NavigationIcon, LogIn, LogOut, Loader2 } from "lucide-react";

function Navigation() {
  const [location] = useLocation();
  const { user, loading, logout } = useAuth();

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
            {user && (
              <div className="flex gap-4">
                <Link href="/">
                  <a
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      location === "/"
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >                    <NavigationIcon className="w-4 h-4" />                  Rota Optimizasyonu
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
            )}
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm text-gray-600">
                  {user.name || user.email}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logout()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Çıkış Yap
                </Button>
              </>
            ) : (
              <Button asChild>
                <a href={getLoginUrl()}>
                  <LogIn className="w-4 h-4 mr-2" />
                  Giriş Yap
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <Ship className="w-24 h-24 mx-auto text-blue-600 mb-6" />
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Yeşil Deniz Taşımacılığı
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Yapay Zeka Destekli Rota Optimizasyonu
          </p>
          <Button asChild size="lg">
            <a href={getLoginUrl()}>
              <LogIn className="w-5 h-5 mr-2" />
              Giriş Yapın
            </a>
          </Button>
        </div>
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
