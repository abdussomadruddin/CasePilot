import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

type ExpiredDocumentRow = {
  id: string;
  case_id: string;
  file_name: string;
  storage_path: string | null;
  expires_at: string | null;
};

const bucketName = "case-documents";
const retentionDays = 45;
const batchSize = 100;

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase environment", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();

  const { data: documents, error } = await supabase
    .from("case_documents")
    .select("id,case_id,file_name,storage_path,expires_at")
    .is("deleted_at", null)
    .lte("expires_at", now.toISOString())
    .limit(batchSize);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const expiredDocuments = (documents || []) as ExpiredDocumentRow[];

  if (!expiredDocuments.length) {
    return Response.json({
      ok: true,
      deleted_documents: 0,
      deleted_files: 0,
    });
  }

  const storagePaths = expiredDocuments
    .map((document) => document.storage_path)
    .filter((path): path is string => Boolean(path));

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove(storagePaths);

    if (storageError) {
      return Response.json(
        { ok: false, error: storageError.message },
        { status: 500 },
      );
    }
  }

  const expiredDocumentIds = expiredDocuments.map((document) => document.id);
  const deletedAt = now.toISOString();

  const { error: updateError } = await supabase
    .from("case_documents")
    .update({
      deleted_at: deletedAt,
      delete_reason: `Auto-deleted after ${retentionDays} days.`,
      storage_deleted: true,
    })
    .in("id", expiredDocumentIds);

  if (updateError) {
    return Response.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  const activityRows = expiredDocuments.map((document) => ({
    case_id: document.case_id,
    type: "document",
    actor_role: "admin",
    actor_name: "System",
    message: `Auto-deleted expired document after ${retentionDays} days: ${document.file_name}.`,
    created_at: deletedAt,
  }));

  const { error: activityError } = await supabase
    .from("case_activities")
    .insert(activityRows);

  if (activityError) {
    return Response.json({ ok: false, error: activityError.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    deleted_documents: expiredDocuments.length,
    deleted_files: storagePaths.length,
  });
});
