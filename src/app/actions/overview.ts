"use server";

import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import { getOverviewDashboardData } from "@/lib/analytics/overview-data";
import type { OverviewDashboardData } from "@/lib/analytics/overview-data";
import { overviewRangeSchema } from "@/lib/validation/schemas";

export type OverviewDashboardResult =
  | { data: OverviewDashboardData }
  | { error: string };

export async function loadOverviewDashboard(
  input: unknown,
): Promise<OverviewDashboardResult> {
  const parsedRange = overviewRangeSchema.safeParse(input);
  if (!parsedRange.success) {
    return { error: "Choose a valid reporting period." };
  }

  try {
    return { data: await getOverviewDashboardData(parsedRange.data) };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: publicErrorMessage(error) };
    }
    throw error;
  }
}
