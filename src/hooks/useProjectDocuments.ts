import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface ProjectDocFolder {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  is_public: boolean;
  public_token: string | null;
  tenant_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocument {
  id: string;
  folder_id: string | null;
  project_id: string;
  title: string;
  content: string | null;
  type: "document" | "file";
  file_path: string | null;
  file_size: number | null;
  file_type: string | null;
  sort_order: number;
  is_public: boolean;
  public_token: string | null;
  tenant_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useProjectDocuments(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const key = ["project-documents", projectId];

  const foldersQuery = useQuery({
    queryKey: [...key, "folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_doc_folders" as any)
        .select("*")
        .eq("project_id", projectId!)
        .order("sort_order");
      if (error) throw error;
      return data as unknown as ProjectDocFolder[];
    },
    enabled: !!projectId,
  });

  const documentsQuery = useQuery({
    queryKey: [...key, "documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_documents" as any)
        .select("*")
        .eq("project_id", projectId!)
        .order("sort_order");
      if (error) throw error;
      return data as unknown as ProjectDocument[];
    },
    enabled: !!projectId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: key });
  };

  const createFolder = useMutation({
    mutationFn: async (params: { name: string; parentId?: string | null }) => {
      const { data, error } = await supabase
        .from("project_doc_folders" as any)
        .insert({
          project_id: projectId!,
          parent_id: params.parentId || null,
          name: params.name,
          tenant_id: tenantId!,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidateAll(); toast.success("Pasta criada!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateFolder = useMutation({
    mutationFn: async (params: { id: string; name?: string; sort_order?: number; is_public?: boolean; public_token?: string | null }) => {
      const { id, ...rest } = params;
      const { error } = await supabase
        .from("project_doc_folders" as any)
        .update(rest as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_doc_folders" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success("Pasta excluída!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleFolderPublic = useMutation({
    mutationFn: async (params: { id: string; isPublic: boolean }) => {
      const update: any = { is_public: params.isPublic };
      if (params.isPublic) {
        update.public_token = generateToken();
      } else {
        update.public_token = null;
      }
      const { error } = await supabase.from("project_doc_folders" as any).update(update).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success("Visibilidade atualizada!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const createDocument = useMutation({
    mutationFn: async (params: { title: string; folderId?: string | null; content?: string; type?: "document" | "file"; file_path?: string; file_size?: number; file_type?: string }) => {
      const { data, error } = await supabase
        .from("project_documents" as any)
        .insert({
          project_id: projectId!,
          folder_id: params.folderId || null,
          title: params.title,
          content: params.content || "",
          type: params.type || "document",
          file_path: params.file_path || null,
          file_size: params.file_size || null,
          file_type: params.file_type || null,
          tenant_id: tenantId!,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProjectDocument;
    },
    onSuccess: () => { invalidateAll(); toast.success("Documento criado!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateDocument = useMutation({
    mutationFn: async (params: { id: string; title?: string; content?: string; folder_id?: string | null; sort_order?: number; is_public?: boolean; public_token?: string | null }) => {
      const { id, ...rest } = params;
      const { error } = await supabase
        .from("project_documents" as any)
        .update(rest as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDocument = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_documents" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success("Documento excluído!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleDocPublic = useMutation({
    mutationFn: async (params: { id: string; isPublic: boolean }) => {
      const update: any = { is_public: params.isPublic };
      if (params.isPublic) {
        update.public_token = generateToken();
      } else {
        update.public_token = null;
      }
      const { error } = await supabase.from("project_documents" as any).update(update).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success("Visibilidade atualizada!"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Move a single document to a different folder
  const moveDocument = useMutation({
    mutationFn: async (params: { docId: string; targetFolderId: string | null }) => {
      const { error } = await supabase
        .from("project_documents" as any)
        .update({ folder_id: params.targetFolderId } as any)
        .eq("id", params.docId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success("Documento movido!"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Move multiple documents to a different folder
  const moveMultipleDocs = useMutation({
    mutationFn: async (params: { docIds: string[]; targetFolderId: string | null }) => {
      for (const docId of params.docIds) {
        const { error } = await supabase
          .from("project_documents" as any)
          .update({ folder_id: params.targetFolderId } as any)
          .eq("id", docId);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidateAll(); toast.success("Documentos movidos!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const uploadFile = async (file: File, folderId?: string | null): Promise<ProjectDocument> => {
    const path = `${tenantId}/projects/${projectId}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("process-documents")
      .upload(path, file);
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("process-documents").getPublicUrl(path);

    const result = await createDocument.mutateAsync({
      title: file.name,
      folderId,
      type: "file",
      file_path: data.publicUrl,
      file_size: file.size,
      file_type: file.type,
      content: file.type === "text/markdown" || file.name.endsWith(".md")
        ? await file.text()
        : undefined,
    });
    return result;
  };

  const uploadImage = async (file: File): Promise<string> => {
    const path = `${tenantId}/projects/${projectId}/images/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("process-documents").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("process-documents").getPublicUrl(path);
    return data.publicUrl;
  };

  const reorderFolders = useMutation({
    mutationFn: async (items: { id: string; sort_order: number }[]) => {
      for (const item of items) {
        const { error } = await supabase
          .from("project_doc_folders" as any)
          .update({ sort_order: item.sort_order } as any)
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const reorderDocs = useMutation({
    mutationFn: async (items: { id: string; sort_order: number }[]) => {
      for (const item of items) {
        const { error } = await supabase
          .from("project_documents" as any)
          .update({ sort_order: item.sort_order } as any)
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const bulkTogglePublic = useMutation({
    mutationFn: async (params: { isPublic: boolean }) => {
      const allFolders = foldersQuery.data || [];
      const allDocs = documentsQuery.data || [];
      for (const folder of allFolders) {
        if (folder.is_public !== params.isPublic) {
          const update: any = { is_public: params.isPublic };
          update.public_token = params.isPublic ? generateToken() : null;
          const { error } = await supabase.from("project_doc_folders" as any).update(update).eq("id", folder.id);
          if (error) throw error;
        }
      }
      for (const doc of allDocs) {
        if (doc.is_public !== params.isPublic) {
          const update: any = { is_public: params.isPublic };
          update.public_token = params.isPublic ? generateToken() : null;
          const { error } = await supabase.from("project_documents" as any).update(update).eq("id", doc.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Visibilidade de todos os itens atualizada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkToggleFolderChildren = useMutation({
    mutationFn: async (params: { folderId: string; isPublic: boolean }) => {
      const allDocs = documentsQuery.data || [];
      const allFolders = foldersQuery.data || [];
      
      const getDescendantFolderIds = (parentId: string): string[] => {
        const children = allFolders.filter(f => f.parent_id === parentId);
        const ids: string[] = [];
        for (const child of children) {
          ids.push(child.id);
          ids.push(...getDescendantFolderIds(child.id));
        }
        return ids;
      };
      
      const folderIds = [params.folderId, ...getDescendantFolderIds(params.folderId)];
      
      for (const fId of folderIds) {
        const folder = allFolders.find(f => f.id === fId);
        if (folder && folder.is_public !== params.isPublic) {
          const update: any = { is_public: params.isPublic };
          update.public_token = params.isPublic ? generateToken() : null;
          const { error } = await supabase.from("project_doc_folders" as any).update(update).eq("id", fId);
          if (error) throw error;
        }
      }
      
      const docsInTree = allDocs.filter(d => d.folder_id && folderIds.includes(d.folder_id));
      for (const doc of docsInTree) {
        if (doc.is_public !== params.isPublic) {
          const update: any = { is_public: params.isPublic };
          update.public_token = params.isPublic ? generateToken() : null;
          const { error } = await supabase.from("project_documents" as any).update(update).eq("id", doc.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Visibilidade da pasta e conteúdos atualizada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    folders: foldersQuery.data || [],
    documents: documentsQuery.data || [],
    isLoading: foldersQuery.isLoading || documentsQuery.isLoading,
    createFolder,
    updateFolder,
    deleteFolder,
    toggleFolderPublic,
    createDocument,
    updateDocument,
    deleteDocument,
    toggleDocPublic,
    reorderFolders,
    reorderDocs,
    bulkTogglePublic,
    bulkToggleFolderChildren,
    uploadFile,
    uploadImage,
    moveDocument,
    moveMultipleDocs,
    invalidateAll,
  };
}
