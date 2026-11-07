"use server";

import { z } from "zod";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import {
  getAnalyticsDashboardData,
  type AnalyticsDashboardData,
} from "@/lib/analytics/dashboard-data";
import { overviewRangeSchema } from "@/lib/validation/schemas";

const analyticsInputSchema = z.object({
  range: overviewRangeSchema,
  productSort: z.enum(["revenue", "units", "orders"]),
});

export type AnalyticsDashboardResult =
  | { data: AnalyticsDashboardData }
  | { error: string };

export async function loadAnalyticsDashboard(input: unknown): Promise<AnalyticsDashboardResult> {
  const parsedInput = analyticsInputSchema.safeParse(input);
  if (!parsedInput.success) return { error: "Choose valid analytics filters." };

  try {
    return {
      data: await getAnalyticsDashboardData(
        parsedInput.data.range,
        parsedInput.data.productSort,
      ),
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: publicErrorMessage(error) };
    }
    throw error;
  }
}
