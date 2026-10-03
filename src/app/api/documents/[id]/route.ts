import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { readFile } from "fs/promises";
import path from "path";

const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");

export const GET = route({ permission: "documents.read" }, async ({ params, session, req }) => {
  const document = await prisma.document.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
  });
  if (!document) throw ApiError.notFound("Document not found.");

  if (req.nextUrl.searchParams.get("download") === "1") {
    try {
      const buffer = await readFile(path.join(STORAGE_DIR, document.storedFilename));
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": document.mimeType,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(document.filename)}"`,
        },
      });
    } catch {
      throw ApiError.notFound("The stored file is no longer available on this server.");
    }
  }
  return ok(document);
});

export const DELETE = route({ permission: "documents.delete" }, async ({ params, session }) => {
  const document = await prisma.document.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
  });
  if (!document) throw ApiError.notFound("Document not found.");
  await prisma.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "DELETED",
    entityType: "Document", entityId: document.id, entityNumber: document.filename,
    summary: `Archived document "${document.filename}"`,
  });
  return ok({ deleted: true });
});
