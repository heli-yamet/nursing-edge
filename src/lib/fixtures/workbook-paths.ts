import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Client workbooks on disk (not in git). All tests that read `.xlsx` files use this folder. */
export const WORKBOOKS_DIR = path.resolve(process.cwd(), "../Workbooks_10_24");

export const PRODUCTION_R8 = {
  selected_1_1000: "Nursing_Edge_Selected_0001_1000_Production_R8_Phase1_C1.xlsx",
  selected_1001_1500: "Nursing_Edge_Selected_1001_1500_Production_R8(1).xlsx",
  selected_1501_2000: "Nursing_Edge_Selected_1501_2000_Production_R8(1).xlsx",
  coverage: "Nursing_Edge_Coverage_Supplement_4_Production_R8(1).xlsx",
  sibling_500: "Nursing_Edge_Sibling500_Production_R8_Phase1_C1.xlsx",
  ap_450: "Nursing_Edge_AP450_Production_R8_Phase1_C1.xlsx",
  calibration: "Nursing_Edge_Calibration_R5_Import.xlsx",
} as const;

export const WORKBOOKS_OCT_24_R2 = [
  "Nursing_Edge_Clinical_Production_R2_Phase4_C1_Part1_of2.xlsx",
  "Nursing_Edge_Clinical_Production_R2_Phase4_C1_Part2_of2.xlsx",
  "Nursing_Edge_Sibling_Production_R2_Phase4_C1_Part1_of2.xlsx",
  "Nursing_Edge_Sibling_Production_R2_Phase4_C1_Part2_of2.xlsx",
] as const;

export function workbookPath(fileName: string): string {
  return path.join(WORKBOOKS_DIR, fileName);
}

export function workbookExists(fileName: string): boolean {
  return existsSync(workbookPath(fileName));
}

export function readWorkbook(fileName: string): Buffer {
  return readFileSync(workbookPath(fileName));
}

export const oct24ClientWorkbooksPresent = WORKBOOKS_OCT_24_R2.every((name) =>
  workbookExists(name),
);