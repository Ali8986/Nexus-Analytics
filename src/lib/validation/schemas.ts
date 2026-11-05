import { z } from "zod";

const uuidSchema = z.string().uuid();
const dateSchema = z.iso.date();
const optionalDateRangeSchema = z
  .object({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .superRefine((range, context) => {
    if ((range.startDate === undefined) !== (range.endDate === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Both startDate and endDate must be provided together.",
      });
      return;
    }

    if (range.startDate && range.endDate) {
      const start = Date.parse(`${range.startDate}T00:00:00Z`);
      const end = Date.parse(`${range.endDate}T00:00:00Z`);
      if (end < start || end - start > 365 * 24 * 60 * 60 * 1000) {
        context.addIssue({
          code: "custom",
          message: "Date ranges must be ordered and no longer than 366 days.",
        });
      }
    }
  });

export const workspaceIdSchema = uuidSchema;
export const recordIdSchema = uuidSchema;

const authEmailSchema = z.string().trim().email().max(320);
const authPasswordSchema = z.string().min(8).max(128);

export const loginSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(128),
});

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    email: authEmailSchema,
    password: authPasswordSchema,
    confirmPassword: z.string().min(1).max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const passwordRecoverySchema = z.object({
  email: authEmailSchema,
});

export const passwordResetSchema = z
  .object({
    password: authPasswordSchema,
    confirmPassword: z.string().min(1).max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const workspaceCreationSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export const auditLogPageSchema = z.object({
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const searchSchema = z.string().trim().min(1).max(100);
export const customerListSchema = paginationSchema.extend({
  search: searchSchema.optional(),
  includeArchived: z.boolean().default(false),
});
export const productListSchema = customerListSchema;
export const customerIdInputSchema = z.object({ customerId: uuidSchema });
export const productIdInputSchema = z.object({ productId: uuidSchema });
export const orderIdInputSchema = z.object({ orderId: uuidSchema });

const contactFields = {
  name: z.string().trim().min(1).max(200),
  companyName: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  region: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(30).nullable().optional(),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).nullable().optional(),
};

export const customerInputSchema = z.object(contactFields);
export const customerUpdateSchema = z.object({
  customerId: uuidSchema,
  ...contactFields,
});

const productFields = {
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(100),
  unitPrice: z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/),
  description: z.string().trim().max(5000).nullable().optional(),
};

export const productInputSchema = z.object(productFields);
export const productUpdateSchema = z.object({
  productId: uuidSchema,
  ...productFields,
});

export const orderCreationSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  customerId: uuidSchema.nullable().optional(),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.number().int().min(1).max(2_147_483_647),
      }),
    )
    .min(1)
    .max(100),
});

export const orderStatusSchema = z.enum([
  "processing",
  "completed",
  "cancelled",
]);

export const orderListFilterSchema = optionalDateRangeSchema.extend({
  status: z.enum(["pending", "processing", "completed", "cancelled"]).optional(),
  customerId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const dateRangeSchema = optionalDateRangeSchema;
export const overviewRangeSchema = z.enum(["7d", "30d", "90d"]);
export const requiredDateRangeSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema })
  .superRefine((range, context) => {
    const parsed = optionalDateRangeSchema.safeParse(range);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message: "Date ranges must be ordered and no longer than 366 days.",
      });
    }
  });

export const presetWindowSchema = z.union([
  z.literal(7),
  z.literal(30),
  z.literal(90),
]);

export const topListSchema = optionalDateRangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const productPerformanceSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    sortBy: z.enum(["revenue", "units", "orders"]).default("revenue"),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .superRefine((range, context) => {
    if (!requiredDateRangeSchema.safeParse(range).success) {
      context.addIssue({
        code: "custom",
        message: "Date ranges must be ordered and no longer than 366 days.",
      });
    }
  });

export const invitationCreateSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "analyst", "viewer"]),
});
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const invitationIdSchema = uuidSchema;
export const memberChangeSchema = z.object({
  memberUserId: uuidSchema,
  role: z.enum(["admin", "analyst", "viewer"]),
});
export const ownershipTransferSchema = z.object({
  newOwnerUserId: uuidSchema,
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type OrderCreationInput = z.infer<typeof orderCreationSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
