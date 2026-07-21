export interface DocFolder {
  id: string;
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

export interface DocDocument {
  id: string;
  folder_id: string | null;
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
