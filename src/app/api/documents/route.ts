import { route, okPaginated, pagination, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { z } from "zod";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");

export const GET = route({ permission: "documents.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const docType = query.get("docType");
  const entityType = query.get("entityType");

  const where = {
    companyId: session.companyId,
    deletedAt: null,
    ...(docType && docType !== "ALL" ? { docType } : {}),
    ...(entityType && entityType !== "ALL" ? { entityType } : {}),
    ...(q
      ? {
          OR: [
            { filename: { contains: q } },
            { entityNumber: { contains: q } },
            { tags: { contains: q } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { name: true } } },
      skip,
      take,
    }),
    prisma.document.count({ where }),
  ]);
  return okPaginated(items, total, page, pageSize);
});

/** Multipart upload: file + metadata. Files are stored under storage/documents/. */
export const POST = route({ permission: "documents.create" }, async ({ req, session }) => {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || file.size === 0) {
    return Response.json(
      { error: { code: "VALIDATION", message: "Please correct the highlighted fields.", details: [{ path: "file", message: "A file is required." }] } },
      { status: 400 }
    );
  }
  if (file.size > 10 * 1024 * 1024) {
    return Response.json(
      { error: { code: "VALIDATION", message: "Please correct the highlighted fields.", details: [{ path: "file", message: "Maximum file size is 10 MB." }] } },
      { status: 400 }
    );
  }

  const metadata = z
    .object({
      docType: z.enum(["CONTRACT", "SPECIFICATION", "CERTIFICATE", "INVOICE", "MANUAL", "IMAGE", "OTHER"]).catch("OTHER"),
      entityType: z.string().max(60).optional(),
      entityId: z.string().max(40).optional(),
      entityNumber: z.string().max(60).optional(),
      tags: z.string().max(200).optional(),
    })
    .parse({
      docType: (form.get("docType") as string) || "OTHER",
      entityType: (form.get("entityType") as string) || undefined,
      entityId: (form.get("entityId") as string) || undefined,
      entityNumber: (form.get("entityNumber") as string) || undefined,
      tags: (form.get("tags") as string) || undefined,
    });

  const safeName = file.name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 120);
  const storedFilename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName}`;
  await mkdir(STORAGE_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(STORAGE_DIR, storedFilename), buffer);

  const document = await prisma.document.create({
    data: {
      companyId: session.companyId,
      filename: safeName,
      storedFilename,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      docType: metadata.docType,
      entityType: metadata.entityType || null,
      entityId: metadata.entityId || null,
      entityNumber: metadata.entityNumber || null,
      tags: metadata.tags || null,
      uploadedById: session.user.id,
    },
  });
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "Document", entityId: document.id, entityNumber: document.filename,
    summary: `Uploaded document "${document.filename}" (${(document.size / 1024).toFixed(1)} kB)`,
    after: { docType: document.docType },
  });
  return Response.json({ data: document }, { status: 201 });
});
