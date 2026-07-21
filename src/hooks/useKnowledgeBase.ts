import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface KBFolder {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KBDocument {
  id: string;
  tenant_id: string;
  folder_id: string | null;
  title: string;
  content: string | null;
  type: "document" | "link";
  link_url: string | null;
  is_personal: boolean;
  owner_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KBAccess {
  id: string;
  tenant_id: string;
  resource_type: "folder" | "document";
  resource_id: string;
  grant_type: "user" | "role" | "all";
  target_id: string | null;
  permission: "read" | "write";
  created_at: string;
}

export interface KBShare {
  id: string;
  document_id: string;
  shared_by: string;
  shared_with: string;
  permission: "read" | "write";
  created_at: string;
}

export function useKnowledgeBase() {
  const { profile, user } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();
  const qk = ["knowledge-base", tenantId];

  // ---- FOLDERS ----
  const foldersQuery = useQuery({
    queryKey: [...qk, "folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_folders")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as KBFolder[];
    },
    enabled: !!tenantId,
  });

  // ---- DOCUMENTS (non-personal) ----
  const docsQuery = useQuery({
    queryKey: [...qk, "documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_documents")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("is_personal", false)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as KBDocument[];
    },
    enabled: !!tenantId,
  });

  // ---- PERSONAL DOCUMENTS ----
  const personalDocsQuery = useQuery({
    queryKey: [...qk, "personal"],
    queryFn: async () => {
      // Own personal docs
      const { data: own, error: ownErr } = await supabase
        .from("knowledge_base_documents")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("is_personal", true)
        .eq("owner_id", user!.id)
        .order("sort_order", { ascending: true });
      if (ownErr) throw ownErr;

      // Shared with me
      const { data: shares, error: shareErr } = await supabase
        .from("knowledge_base_shares")
        .select("document_id")
        .eq("shared_with", user!.id)
        .eq("tenant_id", tenantId!);
      if (shareErr) throw shareErr;

      let sharedDocs: KBDocument[] = [];
      if (shares && shares.length > 0) {
        const docIds = shares.map((s: any) => s.document_id);
        const { data: sd } = await supabase
          .from("knowledge_base_documents")
          .select("*")
          .in("id", docIds);
        sharedDocs = (sd || []) as KBDocument[];
      }

      return {
        own: (own || []) as KBDocument[],
        shared: sharedDocs,
      };
    },
    enabled: !!tenantId && !!user,
  });

  // ---- ACCESS RULES ----
  const accessQuery = useQuery({
    queryKey: [...qk, "access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_access")
        .select("*")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data || []) as KBAccess[];
    },
    enabled: !!tenantId,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: qk });
  };

  // ---- MUTATIONS ----

  const createFolder = useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId?: string | null }) => {
      const { data, error } = await supabase
        .from("knowledge_base_folders")
        .insert({
          tenant_id: tenantId!,
          name,
          parent_id: parentId || null,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(),
  });

  const updateFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("knowledge_base_folders")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("knowledge_base_folders")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const createDocument = useMutation({
    mutationFn: async (params: {
      title: string;
      folderId?: string | null;
      type?: "document" | "link";
      linkUrl?: string;
      isPersonal?: boolean;
      content?: string;
    }) => {
      const { data, error } = await supabase
        .from("knowledge_base_documents")
        .insert({
          tenant_id: tenantId!,
          title: params.title,
          folder_id: params.folderId || null,
          type: params.type || "document",
          link_url: params.linkUrl || null,
          is_personal: params.isPersonal || false,
          owner_id: params.isPersonal ? user!.id : null,
          content: params.content || "",
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(),
  });

  const updateDocument = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<KBDocument, "title" | "content" | "folder_id" | "link_url">> }) => {
      const { error } = await supabase
        .from("knowledge_base_documents")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const deleteDocument = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("knowledge_base_documents")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  // ---- ACCESS MANAGEMENT ----

  const setAccess = useMutation({
    mutationFn: async (params: {
      resourceType: "folder" | "document";
      resourceId: string;
      grantType: "user" | "role" | "all";
      targetId?: string | null;
      permission?: "read" | "write";
    }) => {
      const { error } = await supabase
        .from("knowledge_base_access")
        .upsert({
          tenant_id: tenantId!,
          resource_type: params.resourceType,
          resource_id: params.resourceId,
          grant_type: params.grantType,
          target_id: params.targetId || null,
          permission: params.permission || "read",
        }, { onConflict: "resource_type,resource_id,grant_type,target_id" });
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const removeAccess = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("knowledge_base_access")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  // ---- SHARING (personal docs) ----

  const shareDocument = useMutation({
    mutationFn: async ({ documentId, sharedWith, permission }: { documentId: string; sharedWith: string; permission?: "read" | "write" }) => {
      const { error } = await supabase
        .from("knowledge_base_shares")
        .upsert({
          tenant_id: tenantId!,
          document_id: documentId,
          shared_by: user!.id,
          shared_with: sharedWith,
          permission: permission || "read",
        }, { onConflict: "document_id,shared_with" });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Documento compartilhado!");
    },
  });

  const unshareDocument = useMutation({
    mutationFn: async ({ documentId, sharedWith }: { documentId: string; sharedWith: string }) => {
      const { error } = await supabase
        .from("knowledge_base_shares")
        .delete()
        .eq("document_id", documentId)
        .eq("shared_with", sharedWith);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  // ---- IMAGE UPLOAD ----
  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `kb/${tenantId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("process-documents").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from("process-documents").getPublicUrl(path);
    return publicUrl;
  };

  return {
    folders: foldersQuery.data || [],
    documents: docsQuery.data || [],
    personalDocs: personalDocsQuery.data?.own || [],
    sharedWithMe: personalDocsQuery.data?.shared || [],
    accessRules: accessQuery.data || [],
    isLoading: foldersQuery.isLoading || docsQuery.isLoading,
    personalLoading: personalDocsQuery.isLoading,

    createFolder,
    updateFolder,
    deleteFolder,
    createDocument,
    updateDocument,
    deleteDocument,
    setAccess,
    removeAccess,
    shareDocument,
    unshareDocument,
    uploadImage,
    invalidateAll,
  };
}
