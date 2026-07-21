import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Use the existing anon client (supabase client already has anon key)
// For public access we create a separate anon client without auth session
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/integrations/supabase/config";

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY environment variables. " +
    "Set them in your .env file."
  );
}

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function usePublicDocument(token: string | undefined) {
  const documentQuery = useQuery({
    queryKey: ["public-document", token],
    queryFn: async () => {
      // 1) Try project_documents
      const { data: projDoc } = await anonClient
        .from("project_documents")
        .select("*")
        .eq("public_token", token!)
        .single();

      if (projDoc) return { type: "document" as const, document: projDoc, folder: null, documents: [] };

      // 2) Try project_doc_folders
      const { data: projFolder } = await anonClient
        .from("project_doc_folders")
        .select("*")
        .eq("public_token", token!)
        .single();

      if (projFolder) {
        const { data: docs } = await anonClient
          .from("project_documents")
          .select("*")
          .eq("folder_id", projFolder.id)
          .order("sort_order");
        return { type: "folder" as const, document: null, folder: projFolder, documents: docs || [] };
      }

      throw new Error("Documento não encontrado ou não é público.");
    },
    enabled: !!token,
    retry: false,
  });

  return documentQuery;
}
