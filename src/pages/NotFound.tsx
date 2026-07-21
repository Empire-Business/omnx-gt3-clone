import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center max-w-md animate-fade-in">
        <div className="relative mb-6 mx-auto w-fit">
          <span className="text-[8rem] font-extrabold leading-none tracking-tighter text-primary/10 select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Search className="w-8 h-8 text-primary" />
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">Página não encontrada</h1>
        <p className="text-muted-foreground mb-8">
          A página que você está procurando não existe ou foi movida para outro endereço.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button onClick={() => navigate(-1)} variant="outline" className="gap-2 w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <Button onClick={() => navigate("/")} className="gap-2 w-full sm:w-auto">
            <Home className="w-4 h-4" /> Ir ao Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
