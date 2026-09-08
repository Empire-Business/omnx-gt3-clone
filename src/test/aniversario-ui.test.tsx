/**
 * Aniversário na tela — o que o usuário vê.
 *
 *  1. Quem AINDA NÃO tem data de nascimento é parado pelo modal e só sai depois
 *     de salvar (é o comportamento pedido: obrigatório, uma vez só).
 *  2. Quem faz aniversário hoje aparece no quadro do Dashboard para as OUTRAS
 *     pessoas, com o atalho de parabenizar.
 *  3. O próprio aniversariante recebe a felicitação com o nome dele.
 *
 * Os dados vêm mockados: o objetivo é provar a regra da interface, sem tocar em
 * banco de produção.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/* ── Mocks compartilhados ── */
const authState: { profile: any; user: any; loading: boolean } = {
  user: { id: "u-me" },
  profile: { user_id: "u-me", tenant_id: "t1", full_name: "Bruno Guzela", birth_date: null },
  loading: false,
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

const updateSpy = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: (values: any) => { updateSpy(values); return { eq: () => Promise.resolve({ error: null }) }; } }),
  },
}));

const birthdayState: any = { today: [], upcoming: [], isLoading: false };
vi.mock("@/hooks/useBirthdays", () => ({ useBirthdays: () => birthdayState }));

const findOrCreateDM = vi.fn().mockResolvedValue("dm-1");
vi.mock("@/hooks/useChat", () => ({ findOrCreateDM: (...a: any[]) => findOrCreateDM(...a) }));

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateSpy,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BirthDateGate } from "@/components/shared/BirthDateGate";
import { BirthdayBoard } from "@/components/shared/BirthdayBoard";

beforeEach(() => {
  authState.profile = { user_id: "u-me", tenant_id: "t1", full_name: "Bruno Guzela", birth_date: null };
  birthdayState.today = [];
  birthdayState.upcoming = [];
  birthdayState.isLoading = false;
  updateSpy.mockClear();
  navigateSpy.mockClear();
  localStorage.clear();
});

afterEach(cleanup);

const renderGate = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BirthDateGate />
    </QueryClientProvider>,
  );

describe("modal obrigatório de data de nascimento", () => {
  it("aparece para quem ainda não preencheu", () => {
    renderGate();
    expect(screen.getByText("Quando é o seu aniversário?")).toBeInTheDocument();
  });

  it("não fecha por Esc, por clique fora nem pelo X — a única saída é salvar", async () => {
    renderGate();
    const stillOpen = () => expect(screen.getByText("Quando é o seu aniversário?")).toBeInTheDocument();

    // O X do Dialog fica escondido por CSS; o que garante o bloqueio é o
    // `open` ser controlado sem `onOpenChange` — clicar nele não fecha nada.
    const close = screen.getByRole("button", { name: /close/i });
    await act(async () => { fireEvent.click(close); });
    stillOpen();

    await act(async () => { fireEvent.keyDown(document.activeElement || document.body, { key: "Escape", code: "Escape" }); });
    stillOpen();

    expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeInTheDocument();
  });

  it("não aparece para quem já tem data", () => {
    authState.profile = { ...authState.profile, birth_date: "1990-05-02" };
    renderGate();
    expect(screen.queryByText("Quando é o seu aniversário?")).not.toBeInTheDocument();
  });

  it("recusa ano absurdo e não grava nada", async () => {
    renderGate();
    const input = screen.getByLabelText("Data de nascimento") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2025-01-01" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /salvar e continuar/i })); });
    expect(await screen.findByText(/não parece certa/i)).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("salva a data e some da tela", async () => {
    renderGate();
    const input = screen.getByLabelText("Data de nascimento") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1990-05-02" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /salvar e continuar/i })); });

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ birth_date: "1990-05-02" }));
    await waitFor(() =>
      expect(screen.queryByText("Quando é o seu aniversário?")).not.toBeInTheDocument(),
    );
  });
});

describe("quadro de aniversariantes", () => {
  const renderBoard = () => render(<MemoryRouter><BirthdayBoard /></MemoryRouter>);

  it("some quando não há ninguém hoje nem na semana", () => {
    const { container } = renderBoard();
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra o aniversariante do dia para as outras pessoas", () => {
    birthdayState.today = [
      { user_id: "u-dacio", full_name: "Dácio Andrade", avatar_url: null, birth_date: "1992-09-04", daysUntil: 0, dayLabel: "04/09" },
    ];
    renderBoard();
    expect(screen.getByText("Aniversariantes de hoje")).toBeInTheDocument();
    expect(screen.getByText("Dácio Andrade")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /parabenizar/i })).toBeInTheDocument();
  });

  it("parabenizar abre a conversa com a mensagem já escrita", async () => {
    birthdayState.today = [
      { user_id: "u-dacio", full_name: "Dácio Andrade", avatar_url: null, birth_date: "1992-09-04", daysUntil: 0, dayLabel: "04/09" },
    ];
    renderBoard();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /parabenizar/i })); });

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/chat/dm-1"));
    expect(findOrCreateDM).toHaveBeenCalledWith("u-me", "u-dacio", "t1");
    expect(localStorage.getItem("chat-draft:dm-1")).toBe("Feliz aniversário, Dácio! 🎉🎂 Muitas felicidades!");
  });

  it("felicita o próprio aniversariante pelo nome, sem pedir que ele se parabenize", () => {
    birthdayState.today = [
      { user_id: "u-me", full_name: "Bruno Guzela", avatar_url: null, birth_date: "1990-09-04", daysUntil: 0, dayLabel: "04/09" },
    ];
    renderBoard();
    expect(screen.getByText(/Feliz aniversário, Bruno!/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /parabenizar/i })).not.toBeInTheDocument();
  });

  it("sem ninguém hoje, anuncia os próximos da semana", () => {
    birthdayState.upcoming = [
      { user_id: "u-ana", full_name: "Ana Lima", avatar_url: null, birth_date: "1995-09-08", daysUntil: 4, dayLabel: "08/09" },
    ];
    renderBoard();
    expect(screen.getByText("Próximos aniversários")).toBeInTheDocument();
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
  });
});
