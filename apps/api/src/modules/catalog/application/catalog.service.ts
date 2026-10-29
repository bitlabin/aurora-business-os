import { Injectable } from '@nestjs/common';
import {
  AppError,
  type CreateItemRequest,
  type Item,
  type ItemCapabilities,
  type ItemCategory,
  type ItemCategoryId,
  type ItemId,
  type ItemListQuery,
  ITEM_KIND_POLICIES,
  type LocalizedText,
  type ModuleKey,
  type PhysicalProfile,
  type UomId,
  type UpdateItemRequest,
  newId,
} from '@aurora/types';
import { and, asc, eq, gt, ilike, or, sql } from 'drizzle-orm';
import { UnitOfWork } from '../../../platform/database/unit-of-work';
import { OutboxService } from '../../../platform/events/outbox.service';
import { decodeCursor, page } from '../../../platform/http/cursor';
import { AuditService } from '../../audit';
import { normalizeCode, validateItemCapabilities } from '../domain/item';
import {
  itemBarcodes,
  itemCategories,
  itemPhysicalProfiles,
  items,
  uoms,
} from '../infrastructure/schema';

interface Actor {
  userId?: string | undefined;
  requestId?: string | undefined;
}

/** Units every tenant starts with; tenants can add more. Codes are stable identifiers. */
export const DEFAULT_UOMS: {
  code: string;
  name: LocalizedText;
  kind: 'COUNT' | 'TIME' | 'WEIGHT' | 'LENGTH' | 'AREA' | 'VOLUME';
  decimals: number;
}[] = [
  { code: 'EA', name: { en: 'Each', ar: 'قطعة' }, kind: 'COUNT', decimals: 0 },
  { code: 'HOUR', name: { en: 'Hour', ar: 'ساعة' }, kind: 'TIME', decimals: 2 },
  { code: 'DAY', name: { en: 'Day', ar: 'يوم' }, kind: 'TIME', decimals: 2 },
  { code: 'MONTH', name: { en: 'Month', ar: 'شهر' }, kind: 'TIME', decimals: 0 },
  { code: 'KG', name: { en: 'Kilogram', ar: 'كيلوغرام' }, kind: 'WEIGHT', decimals: 3 },
  { code: 'M', name: { en: 'Metre', ar: 'متر' }, kind: 'LENGTH', decimals: 2 },
  { code: 'M2', name: { en: 'Square metre', ar: 'متر مربع' }, kind: 'AREA', decimals: 2 },
  { code: 'L', name: { en: 'Litre', ar: 'لتر' }, kind: 'VOLUME', decimals: 3 },
];

/** Universal catalog (ADR-005, INV-001, SAL-001 foundation). */
@Injectable()
export class CatalogService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async ensureDefaultUoms(tenantId: string, actor: Actor): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        for (const u of DEFAULT_UOMS) {
          await db
            .insert(uoms)
            .values({
              id: newId<UomId>(),
              tenantId,
              code: u.code,
              name: u.name,
              kind: u.kind,
              decimals: u.decimals,
              createdBy: actor.userId ?? null,
            })
            .onConflictDoNothing();
        }
      },
    );
  }

  async listUoms(tenantId: string) {
    return this.uow.run({ tenantId }, (db) =>
      db.query.uoms.findMany({ where: eq(uoms.tenantId, tenantId), orderBy: uoms.code }),
    );
  }

  async listCategories(tenantId: string): Promise<ItemCategory[]> {
    return this.uow.run({ tenantId }, async (db) => {
      const rows = await db.query.itemCategories.findMany({
        where: eq(itemCategories.tenantId, tenantId),
        orderBy: itemCategories.code,
      });
      return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, parentId: r.parentId }));
    });
  }

  /** Create categories that do not exist yet (used by industry packs). Idempotent by code. */
  async ensureCategories(
    tenantId: string,
    categories: { code: string; name: LocalizedText; sourcePackId?: string }[],
    actor: Actor,
  ): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        for (const c of categories) {
          await db
            .insert(itemCategories)
            .values({
              id: newId<ItemCategoryId>(),
              tenantId,
              code: c.code,
              name: c.name,
              sourcePackId: c.sourcePackId ?? null,
              createdBy: actor.userId ?? null,
            })
            .onConflictDoNothing();
        }
      },
    );
  }

  async createCategory(
    tenantId: string,
    input: { code: string; name: LocalizedText; parentId?: string | null },
    actor: Actor,
  ): Promise<ItemCategory> {
    const id = newId<ItemCategoryId>();
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const dup = await db.query.itemCategories.findFirst({
          where: and(eq(itemCategories.tenantId, tenantId), eq(itemCategories.code, input.code)),
        });
        if (dup) throw AppError.conflict(`Category "${input.code}" already exists`);
        const [row] = await db
          .insert(itemCategories)
          .values({
            id,
            tenantId,
            code: input.code,
            name: input.name,
            parentId: input.parentId ?? null,
            createdBy: actor.userId ?? null,
          })
          .returning();
        if (!row) throw new Error('insert returned no row');
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'item_category.created',
          subjectType: 'item_category',
          subjectId: id,
          after: { code: input.code },
        });
        return { id: row.id, code: row.code, name: row.name, parentId: row.parentId };
      },
    );
  }

  /**
   * Create an item. `enabledModules` is the caller's effective module set (from the request
   * context) so a stocked good cannot be created for a company without inventory.
   */
  async createItem(
    tenantId: string,
    input: CreateItemRequest,
    enabledModules: ReadonlySet<ModuleKey>,
    actor: Actor,
  ): Promise<Item> {
    const capabilities = validateItemCapabilities(input.kind, input.capabilities, enabledModules);
    const physical: PhysicalProfile | undefined = 'physical' in input ? input.physical : undefined;
    if (physical && !ITEM_KIND_POLICIES[input.kind].physical) {
      throw AppError.businessRule(`Item kind ${input.kind} cannot have physical attributes`, [
        { path: 'physical', message: 'not allowed for this kind' },
      ]);
    }
    const id = newId<ItemId>();
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const uom = await db.query.uoms.findFirst({
          where: and(eq(uoms.tenantId, tenantId), eq(uoms.code, input.baseUomCode)),
        });
        if (!uom)
          throw AppError.businessRule(`Unit of measure "${input.baseUomCode}" does not exist`, [
            { path: 'baseUomCode', message: 'unknown unit' },
          ]);
        if (input.categoryId) {
          const cat = await db.query.itemCategories.findFirst({
            where: and(
              eq(itemCategories.tenantId, tenantId),
              eq(itemCategories.id, input.categoryId),
            ),
          });
          if (!cat)
            throw AppError.businessRule('Category does not exist', [
              { path: 'categoryId', message: 'unknown category' },
            ]);
        }
        const codeNormalized = normalizeCode(input.code);
        const dup = await db.query.items.findFirst({
          where: and(eq(items.tenantId, tenantId), eq(items.codeNormalized, codeNormalized)),
        });
        if (dup) throw AppError.conflict(`Item code "${input.code}" already exists`);

        const [row] = await db
          .insert(items)
          .values({
            id,
            tenantId,
            kind: input.kind,
            code: input.code.trim(),
            codeNormalized,
            name: input.name,
            description: input.description ?? null,
            categoryId: input.categoryId ?? null,
            baseUomId: uom.id,
            ...toColumns(capabilities),
            customFields: input.customFields,
            createdBy: actor.userId ?? null,
          })
          .returning();
        if (!row) throw new Error('insert returned no row');

        let storedPhysical: PhysicalProfile | null = null;
        if (physical) {
          storedPhysical = await this.writePhysical(tenantId, id, physical, actor);
        }

        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'item.created',
          subjectType: 'item',
          subjectId: id,
          after: { kind: input.kind, code: input.code, capabilities },
        });
        await this.outbox.publish({
          tenantId,
          domain: 'catalog',
          type: 'item.created',
          aggregateType: 'item',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { kind: input.kind, code: input.code },
          actorUserId: actor.userId,
        });
        return toItem(row, uom.code, storedPhysical);
      },
    );
  }

  async updateItem(
    tenantId: string,
    itemId: string,
    input: UpdateItemRequest,
    expectedVersion: number | undefined,
    enabledModules: ReadonlySet<ModuleKey>,
    actor: Actor,
  ): Promise<Item> {
    return this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const current = await db.query.items.findFirst({
          where: and(eq(items.tenantId, tenantId), eq(items.id, itemId)),
        });
        if (!current) throw AppError.notFound('Item');
        if (expectedVersion !== undefined && current.version !== expectedVersion)
          throw AppError.versionConflict(current.version);

        const merged: Partial<ItemCapabilities> = {
          ...fromColumns(current),
          ...input.capabilities,
        };
        const capabilities = validateItemCapabilities(current.kind, merged, enabledModules);
        if (input.physical && !ITEM_KIND_POLICIES[current.kind].physical) {
          throw AppError.businessRule(`Item kind ${current.kind} cannot have physical attributes`, [
            { path: 'physical', message: 'not allowed for this kind' },
          ]);
        }
        let uomId = current.baseUomId;
        let uomCode: string | undefined;
        if (input.baseUomCode) {
          const uom = await db.query.uoms.findFirst({
            where: and(eq(uoms.tenantId, tenantId), eq(uoms.code, input.baseUomCode)),
          });
          if (!uom)
            throw AppError.businessRule(`Unit of measure "${input.baseUomCode}" does not exist`, [
              { path: 'baseUomCode', message: 'unknown unit' },
            ]);
          uomId = uom.id;
          uomCode = uom.code;
        }
        const [row] = await db
          .update(items)
          .set({
            name: input.name ?? current.name,
            description: input.description === undefined ? current.description : input.description,
            categoryId: input.categoryId === undefined ? current.categoryId : input.categoryId,
            baseUomId: uomId,
            ...toColumns(capabilities),
            customFields: input.customFields ?? current.customFields,
            updatedBy: actor.userId ?? null,
          })
          .where(
            and(
              eq(items.tenantId, tenantId),
              eq(items.id, itemId),
              eq(items.version, current.version),
            ),
          )
          .returning();
        if (!row) throw AppError.versionConflict(current.version);

        const physical = input.physical
          ? await this.writePhysical(tenantId, itemId, input.physical, actor)
          : await this.readPhysical(tenantId, itemId);
        if (uomCode === undefined) {
          const uom = await db.query.uoms.findFirst({
            where: and(eq(uoms.tenantId, tenantId), eq(uoms.id, uomId)),
          });
          uomCode = uom?.code ?? '';
        }
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'item.updated',
          subjectType: 'item',
          subjectId: itemId,
          before: { ...fromColumns(current) },
          after: { ...capabilities },
        });
        await this.outbox.publish({
          tenantId,
          domain: 'catalog',
          type: 'item.updated',
          aggregateType: 'item',
          aggregateId: itemId,
          aggregateVersion: row.version,
          payload: {},
          actorUserId: actor.userId,
        });
        return toItem(row, uomCode, physical);
      },
    );
  }

  async getItem(tenantId: string, itemId: string): Promise<Item | null> {
    return this.uow.run({ tenantId }, async (db) => {
      const row = await db
        .select({ item: items, uomCode: uoms.code })
        .from(items)
        .innerJoin(uoms, and(eq(uoms.tenantId, items.tenantId), eq(uoms.id, items.baseUomId)))
        .where(and(eq(items.tenantId, tenantId), eq(items.id, itemId)))
        .limit(1);
      const first = row[0];
      if (!first) return null;
      return toItem(first.item, first.uomCode, await this.readPhysical(tenantId, itemId));
    });
  }

  async listItems(
    tenantId: string,
    query: ItemListQuery,
  ): Promise<{ items: Item[]; nextCursor: string | null }> {
    return this.uow.run({ tenantId }, async (db) => {
      const conditions = [eq(items.tenantId, tenantId)];
      const after = decodeCursor(query.cursor);
      if (after) conditions.push(gt(items.id, after));
      if (query.kind) conditions.push(eq(items.kind, query.kind));
      if (query.status) conditions.push(eq(items.status, query.status));
      if (query.categoryId) conditions.push(eq(items.categoryId, query.categoryId));
      if (query.q) {
        const term = `%${query.q.replace(/[%_]/g, '\\$&')}%`;
        conditions.push(or(ilike(items.code, term), ilike(items.name, term)) ?? sql`true`);
      }
      const rows = await db
        .select({ item: items, uomCode: uoms.code })
        .from(items)
        .innerJoin(uoms, and(eq(uoms.tenantId, items.tenantId), eq(uoms.id, items.baseUomId)))
        .where(and(...conditions))
        .orderBy(asc(items.id))
        .limit(query.limit + 1);
      // Physical profiles are only loaded for detail views; list rows carry null to stay cheap.
      const mapped = rows.map((r) => toItem(r.item, r.uomCode, null));
      return page(mapped, query.limit);
    });
  }

  async archiveItem(tenantId: string, itemId: string, actor: Actor): Promise<void> {
    await this.uow.run(
      { tenantId, userId: actor.userId, requestId: actor.requestId },
      async (db) => {
        const current = await db.query.items.findFirst({
          where: and(eq(items.tenantId, tenantId), eq(items.id, itemId)),
        });
        if (!current) throw AppError.notFound('Item');
        if (current.status === 'ARCHIVED') return;
        await db
          .update(items)
          .set({ status: 'ARCHIVED', updatedBy: actor.userId ?? null })
          .where(eq(items.id, itemId));
        await this.audit.record({
          tenantId,
          actorUserId: actor.userId,
          action: 'item.archived',
          subjectType: 'item',
          subjectId: itemId,
          before: { status: current.status },
          after: { status: 'ARCHIVED' },
        });
      },
    );
  }

  private async writePhysical(
    tenantId: string,
    itemId: string,
    physical: PhysicalProfile,
    actor: Actor,
  ): Promise<PhysicalProfile> {
    const db = this.uow.db;
    await db
      .insert(itemPhysicalProfiles)
      .values({
        tenantId,
        itemId,
        weightKg: physical.weightKg ?? null,
        lengthCm: physical.lengthCm ?? null,
        widthCm: physical.widthCm ?? null,
        heightCm: physical.heightCm ?? null,
        casePackQuantity: physical.casePackQuantity ?? null,
        createdBy: actor.userId ?? null,
      })
      .onConflictDoUpdate({
        target: [itemPhysicalProfiles.tenantId, itemPhysicalProfiles.itemId],
        set: {
          weightKg: physical.weightKg ?? null,
          lengthCm: physical.lengthCm ?? null,
          widthCm: physical.widthCm ?? null,
          heightCm: physical.heightCm ?? null,
          casePackQuantity: physical.casePackQuantity ?? null,
          updatedBy: actor.userId ?? null,
        },
      });
    await db
      .delete(itemBarcodes)
      .where(and(eq(itemBarcodes.tenantId, tenantId), eq(itemBarcodes.itemId, itemId)));
    for (const b of physical.barcodes) {
      const dup = await db.query.itemBarcodes.findFirst({
        where: and(eq(itemBarcodes.tenantId, tenantId), eq(itemBarcodes.value, b.value)),
      });
      if (dup && dup.itemId !== itemId)
        throw AppError.conflict(`Barcode ${b.value} is already assigned to another item`);
      await db
        .insert(itemBarcodes)
        .values({
          id: newId(),
          tenantId,
          itemId,
          value: b.value,
          symbology: b.symbology,
          isPrimary: b.isPrimary,
          createdBy: actor.userId ?? null,
        });
    }
    return (await this.readPhysical(tenantId, itemId)) ?? { barcodes: [] };
  }

  private async readPhysical(tenantId: string, itemId: string): Promise<PhysicalProfile | null> {
    const db = this.uow.db;
    const profile = await db.query.itemPhysicalProfiles.findFirst({
      where: and(
        eq(itemPhysicalProfiles.tenantId, tenantId),
        eq(itemPhysicalProfiles.itemId, itemId),
      ),
    });
    const codes = await db.query.itemBarcodes.findMany({
      where: and(eq(itemBarcodes.tenantId, tenantId), eq(itemBarcodes.itemId, itemId)),
    });
    if (!profile && codes.length === 0) return null;
    return {
      barcodes: codes.map((c) => ({
        value: c.value,
        symbology: c.symbology as PhysicalProfile['barcodes'][number]['symbology'],
        isPrimary: c.isPrimary,
      })),
      weightKg: profile?.weightKg ?? null,
      lengthCm: profile?.lengthCm ?? null,
      widthCm: profile?.widthCm ?? null,
      heightCm: profile?.heightCm ?? null,
      casePackQuantity: profile?.casePackQuantity ?? null,
    };
  }
}

function toColumns(c: ItemCapabilities) {
  return {
    trackInventory: c.track_inventory,
    trackLot: c.track_lot,
    trackSerial: c.track_serial,
    trackExpiry: c.track_expiry,
    trackLocation: c.track_location,
    isSellable: c.is_sellable,
    isPurchasable: c.is_purchasable,
    isBillable: c.is_billable,
    isTaxable: c.is_taxable,
    requiresFulfillment: c.requires_fulfillment,
  };
}

function fromColumns(row: typeof items.$inferSelect): ItemCapabilities {
  return {
    track_inventory: row.trackInventory,
    track_lot: row.trackLot,
    track_serial: row.trackSerial,
    track_expiry: row.trackExpiry,
    track_location: row.trackLocation,
    is_sellable: row.isSellable,
    is_purchasable: row.isPurchasable,
    is_billable: row.isBillable,
    is_taxable: row.isTaxable,
    requires_fulfillment: row.requiresFulfillment,
  };
}

function toItem(
  row: typeof items.$inferSelect,
  uomCode: string,
  physical: PhysicalProfile | null,
): Item {
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind,
    code: row.code,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    baseUomCode: uomCode,
    status: row.status,
    capabilities: fromColumns(row),
    physical,
    customFields: row.customFields as Record<string, string | number | boolean | null>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
