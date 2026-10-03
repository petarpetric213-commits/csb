-- ============================================================================
-- NEXORA ERP — initial schema (SQLite dialect)
-- Mirrors prisma/schema.prisma exactly (table & column names are quoted and
-- case-sensitive). Applied by scripts/db-push.ts via node:sqlite.
-- For PostgreSQL, port types: TEXT→TEXT, DATETIME→TIMESTAMP(3),
-- BOOLEAN→BOOLEAN, REAL→DOUBLE PRECISION / DECIMAL(12,2) for money.
-- ============================================================================

PRAGMA foreign_keys=OFF;

-- ============================== Tenancy & Identity ==============================

CREATE TABLE "Company" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT,
    "taxNumber" TEXT,
    "registrationNumber" TEXT,
    "street" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "locale" TEXT NOT NULL DEFAULT 'de',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "logoUrl" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Company_legalName_idx" ON "Company"("legalName");

CREATE TABLE "User" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerifiedAt" DATETIME,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT 0,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Role" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Role_companyId_key_key" ON "Role"("companyId", "key");

CREATE TABLE "RolePermission" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RolePermission_roleId_permission_key" ON "RolePermission"("roleId", "permission");
CREATE INDEX "RolePermission_permission_idx" ON "RolePermission"("permission");

CREATE TABLE "Employee" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "position" TEXT,
    "managerId" TEXT,
    "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Employee_companyId_employeeNumber_key" ON "Employee"("companyId", "employeeNumber");
CREATE INDEX "Employee_companyId_lastName_idx" ON "Employee"("companyId", "lastName");

CREATE TABLE "UserCompany" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "employeeId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCompany_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserCompany_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserCompany_userId_companyId_key" ON "UserCompany"("userId", "companyId");
CREATE INDEX "UserCompany_companyId_idx" ON "UserCompany"("companyId");

CREATE TABLE "Session" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "companyId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE TABLE "PasswordResetToken" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- ============================== CRM ==============================

CREATE TABLE "CustomerGroup" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountPercent" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerGroup_companyId_name_key" ON "CustomerGroup"("companyId", "name");

CREATE TABLE "Customer" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COMPANY',
    "companyName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "taxNumber" TEXT,
    "registrationNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "billingStreet" TEXT,
    "billingCity" TEXT,
    "billingPostalCode" TEXT,
    "billingCountry" TEXT NOT NULL DEFAULT 'DE',
    "shippingStreet" TEXT,
    "shippingCity" TEXT,
    "shippingPostalCode" TEXT,
    "shippingCountry" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "creditLimit" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "groupId" TEXT,
    "assignedToId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Customer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Customer_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Customer_companyId_customerNumber_key" ON "Customer"("companyId", "customerNumber");
CREATE INDEX "Customer_companyId_status_idx" ON "Customer"("companyId", "status");
CREATE INDEX "Customer_companyId_companyName_idx" ON "Customer"("companyId", "companyName");

CREATE TABLE "CustomerContact" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "customerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");

CREATE TABLE "Supplier" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierNumber" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "taxNumber" TEXT,
    "registrationNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "street" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "bankName" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "category" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Supplier_companyId_supplierNumber_key" ON "Supplier"("companyId", "supplierNumber");
CREATE INDEX "Supplier_companyId_status_idx" ON "Supplier"("companyId", "status");

CREATE TABLE "SupplierContact" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "supplierId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");

-- ============================== Products ==============================

CREATE TABLE "ProductCategory" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductCategory_companyId_name_key" ON "ProductCategory"("companyId", "name");

CREATE TABLE "Product" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "ean" TEXT,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "categoryId" TEXT,
    "brand" TEXT,
    "manufacturer" TEXT,
    "productType" TEXT NOT NULL DEFAULT 'FINISHED_GOOD',
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "purchasePrice" REAL NOT NULL DEFAULT 0,
    "salesPrice" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 19,
    "minStock" REAL NOT NULL DEFAULT 0,
    "maxStock" REAL NOT NULL DEFAULT 0,
    "reorderPoint" REAL NOT NULL DEFAULT 0,
    "weightKg" REAL,
    "dimensions" TEXT,
    "shelfLifeDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "imageUrl" TEXT,
    "supplierId" TEXT,
    "isStockTracked" BOOLEAN NOT NULL DEFAULT 1,
    "isBatchTracked" BOOLEAN NOT NULL DEFAULT 0,
    "isExpiryTracked" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");
CREATE INDEX "Product_companyId_name_idx" ON "Product"("companyId", "name");
CREATE INDEX "Product_companyId_status_idx" ON "Product"("companyId", "status");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

CREATE TABLE "ProductVariant" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attributes" TEXT,
    "barcode" TEXT,
    "salesPrice" REAL,
    "purchasePrice" REAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

CREATE TABLE "ProductPriceHistory" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "productId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "validFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductPriceHistory_productId_validFrom_idx" ON "ProductPriceHistory"("productId", "validFrom");

-- ============================== Warehousing & Inventory ==============================

CREATE TABLE "Warehouse" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "managerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Warehouse_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Warehouse_companyId_code_key" ON "Warehouse"("companyId", "code");

CREATE TABLE "WarehouseLocation" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT,
    "aisle" TEXT,
    "rack" TEXT,
    "shelf" TEXT,
    "bin" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarehouseLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WarehouseLocation_warehouseId_code_key" ON "WarehouseLocation"("warehouseId", "code");

CREATE TABLE "InventoryItem" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "physicalQty" REAL NOT NULL DEFAULT 0,
    "reservedQty" REAL NOT NULL DEFAULT 0,
    "quarantinedQty" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryItem_productId_warehouseId_key" ON "InventoryItem"("productId", "warehouseId");
CREATE INDEX "InventoryItem_companyId_idx" ON "InventoryItem"("companyId");

CREATE TABLE "InventoryMovement" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "movementNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "quantity" REAL NOT NULL,
    "unitCost" REAL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "referenceNumber" TEXT,
    "batchNumber" TEXT,
    "expiryDate" DATETIME,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryMovement_companyId_movementNumber_key" ON "InventoryMovement"("companyId", "movementNumber");
CREATE INDEX "InventoryMovement_companyId_createdAt_idx" ON "InventoryMovement"("companyId", "createdAt");
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");
CREATE INDEX "InventoryMovement_warehouseId_idx" ON "InventoryMovement"("warehouseId");
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");

-- ============================== Purchasing ==============================

CREATE TABLE "PurchaseOrder" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" DATETIME,
    "warehouseId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discountTotal" REAL NOT NULL DEFAULT 0,
    "taxTotal" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "sentAt" DATETIME,
    "confirmedAt" DATETIME,
    "receivedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseOrder_companyId_orderNumber_key" ON "PurchaseOrder"("companyId", "orderNumber");
CREATE INDEX "PurchaseOrder_companyId_status_idx" ON "PurchaseOrder"("companyId", "status");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT,
    "quantity" REAL NOT NULL,
    "receivedQuantity" REAL NOT NULL DEFAULT 0,
    "unitPrice" REAL NOT NULL,
    "discountPercent" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 19,
    "lineTotal" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");

CREATE TABLE "GoodsReceipt" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "receivedById" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoodsReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoodsReceipt_companyId_receiptNumber_key" ON "GoodsReceipt"("companyId", "receiptNumber");
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");

CREATE TABLE "GoodsReceiptItem" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" DATETIME,
    "qualityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================== Sales ==============================

CREATE TABLE "SalesQuote" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discountTotal" REAL NOT NULL DEFAULT 0,
    "taxTotal" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "salesRepId" TEXT,
    "notes" TEXT,
    "convertedOrderId" TEXT,
    "convertedAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "SalesQuote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesQuote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesQuote_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SalesQuote_companyId_quoteNumber_key" ON "SalesQuote"("companyId", "quoteNumber");
CREATE INDEX "SalesQuote_companyId_status_idx" ON "SalesQuote"("companyId", "status");
CREATE INDEX "SalesQuote_customerId_idx" ON "SalesQuote"("customerId");

CREATE TABLE "SalesQuoteItem" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "salesQuoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "discountPercent" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 19,
    "lineTotal" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SalesQuoteItem_salesQuoteId_fkey" FOREIGN KEY ("salesQuoteId") REFERENCES "SalesQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesQuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SalesQuoteItem_salesQuoteId_idx" ON "SalesQuoteItem"("salesQuoteId");

CREATE TABLE "SalesOrder" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quoteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedDeliveryDate" DATETIME,
    "deliveryDate" DATETIME,
    "warehouseId" TEXT,
    "salesRepId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discountTotal" REAL NOT NULL DEFAULT 0,
    "taxTotal" REAL NOT NULL DEFAULT 0,
    "shippingCost" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "confirmedAt" DATETIME,
    "shippedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "SalesOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SalesOrder_companyId_orderNumber_key" ON "SalesOrder"("companyId", "orderNumber");
CREATE INDEX "SalesOrder_companyId_status_idx" ON "SalesOrder"("companyId", "status");
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");
CREATE INDEX "SalesOrder_companyId_orderDate_idx" ON "SalesOrder"("companyId", "orderDate");

CREATE TABLE "SalesOrderItem" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT,
    "quantity" REAL NOT NULL,
    "shippedQuantity" REAL NOT NULL DEFAULT 0,
    "unitPrice" REAL NOT NULL,
    "discountPercent" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 19,
    "lineTotal" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SalesOrderItem_salesOrderId_idx" ON "SalesOrderItem"("salesOrderId");
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");

CREATE TABLE "Shipment" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "plannedDate" DATETIME,
    "actualDate" DATETIME,
    "shippingAddress" TEXT,
    "packageCount" INTEGER NOT NULL DEFAULT 1,
    "weightKg" REAL,
    "driverName" TEXT,
    "route" TEXT,
    "plannerId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Shipment_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Shipment_companyId_shipmentNumber_key" ON "Shipment"("companyId", "shipmentNumber");
CREATE INDEX "Shipment_companyId_status_idx" ON "Shipment"("companyId", "status");
CREATE INDEX "Shipment_customerId_idx" ON "Shipment"("customerId");
CREATE INDEX "Shipment_plannedDate_idx" ON "Shipment"("plannedDate");

CREATE TABLE "ShipmentItem" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShipmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ShipmentItem_shipmentId_idx" ON "ShipmentItem"("shipmentId");

-- ============================== Invoicing & Payments ==============================

CREATE TABLE "Invoice" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discountTotal" REAL NOT NULL DEFAULT 0,
    "taxTotal" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedById" TEXT,
    "issuedAt" DATETIME,
    "paidAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Invoice_companyId_invoiceNumber_key" ON "Invoice"("companyId", "invoiceNumber");
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX "Invoice_companyId_dueDate_idx" ON "Invoice"("companyId", "dueDate");

CREATE TABLE "InvoiceItem" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "discountPercent" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 19,
    "lineTotal" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

CREATE TABLE "Payment" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "customerId" TEXT,
    "supplierId" TEXT,
    "invoiceId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT,
    "purchaseOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Payment_companyId_paymentNumber_key" ON "Payment"("companyId", "paymentNumber");
CREATE INDEX "Payment_companyId_paidAt_idx" ON "Payment"("companyId", "paidAt");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- ============================== Production ==============================

CREATE TABLE "WorkCenter" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "description" TEXT,
    "capacityPerDay" REAL NOT NULL DEFAULT 0,
    "hourlyCost" REAL NOT NULL DEFAULT 0,
    "operatingSchedule" TEXT,
    "managerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkCenter_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkCenter_companyId_code_key" ON "WorkCenter"("companyId", "code");

CREATE TABLE "Bom" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bom_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bom_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Bom_productId_version_key" ON "Bom"("productId", "version");
CREATE INDEX "Bom_companyId_status_idx" ON "Bom"("companyId", "status");

CREATE TABLE "BomItem" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "bomId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "wastePercent" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "BomItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BomItem_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BomItem_bomId_idx" ON "BomItem"("bomId");
CREATE INDEX "BomItem_componentProductId_idx" ON "BomItem"("componentProductId");

CREATE TABLE "ProductionOrder" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "bomId" TEXT,
    "quantity" REAL NOT NULL,
    "producedQuantity" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "plannedStart" DATETIME,
    "plannedEnd" DATETIME,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "warehouseId" TEXT,
    "workCenterId" TEXT,
    "responsibleId" TEXT,
    "materialStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT,
    "releasedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ProductionOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductionOrder_companyId_orderNumber_key" ON "ProductionOrder"("companyId", "orderNumber");
CREATE INDEX "ProductionOrder_companyId_status_idx" ON "ProductionOrder"("companyId", "status");
CREATE INDEX "ProductionOrder_productId_idx" ON "ProductionOrder"("productId");

CREATE TABLE "ProductionOrderComponent" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requiredQty" REAL NOT NULL,
    "issuedQty" REAL NOT NULL DEFAULT 0,
    "warehouseId" TEXT,
    CONSTRAINT "ProductionOrderComponent_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProductionOrderComponent_productionOrderId_idx" ON "ProductionOrderComponent"("productionOrderId");

-- ============================== Quality ==============================

CREATE TABLE "QualityInspection" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'GOODS_RECEIPT',
    "sourceId" TEXT,
    "productionOrderId" TEXT,
    "inspectorId" TEXT,
    "inspectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "criteria" TEXT,
    "measurements" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityInspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityInspection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityInspection_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QualityInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityInspection_companyId_inspectionNumber_key" ON "QualityInspection"("companyId", "inspectionNumber");
CREATE INDEX "QualityInspection_companyId_result_idx" ON "QualityInspection"("companyId", "result");
CREATE INDEX "QualityInspection_productId_idx" ON "QualityInspection"("productId");

-- ============================== Platform services ==============================

CREATE TABLE "Document" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'OTHER',
    "entityType" TEXT,
    "entityId" TEXT,
    "entityNumber" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Document_companyId_entityType_entityId_idx" ON "Document"("companyId", "entityType", "entityId");
CREATE INDEX "Document_companyId_createdAt_idx" ON "Document"("companyId", "createdAt");

CREATE TABLE "Task" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assigneeId" TEXT,
    "createdById" TEXT,
    "dueDate" DATETIME,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Task_companyId_status_idx" ON "Task"("companyId", "status");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

CREATE TABLE "Notification" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_companyId_createdAt_idx" ON "Notification"("companyId", "createdAt");

CREATE TABLE "AuditLog" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityNumber" TEXT,
    "summary" TEXT,
    "beforeData" TEXT,
    "afterData" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_companyId_entityType_idx" ON "AuditLog"("companyId", "entityType");

CREATE TABLE "Setting" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Setting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Setting_companyId_key_key" ON "Setting"("companyId", "key");

CREATE TABLE "EmailLog" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "companyId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOGGED',
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EmailLog_companyId_createdAt_idx" ON "EmailLog"("companyId", "createdAt");

PRAGMA foreign_keys=ON;
