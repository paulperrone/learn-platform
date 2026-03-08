/**
 * Structured event logger — writes JSONL to simulation run directories.
 */
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { SimulationEvent } from "./types.js";

export class EventLogger {
  private runDir: string;
  private eventsPath: string;
  private tick = 0;

  constructor(profileId: string, baseDir: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.runDir = join(baseDir, `${profileId}-${timestamp}`);
    mkdirSync(this.runDir, { recursive: true });
    this.eventsPath = join(this.runDir, "events.jsonl");

    // Write empty file to ensure it exists
    if (!existsSync(this.eventsPath)) {
      writeFileSync(this.eventsPath, "");
    }
  }

  getRunDir(): string {
    return this.runDir;
  }

  log(event: Omit<SimulationEvent, "tick">): void {
    this.tick++;
    const fullEvent: SimulationEvent = { tick: this.tick, ...event };
    appendFileSync(this.eventsPath, JSON.stringify(fullEvent) + "\n");
  }

  /** Write a summary JSON alongside the events */
  writeSummary(data: Record<string, unknown>): void {
    writeFileSync(
      join(this.runDir, "summary.json"),
      JSON.stringify(data, null, 2) + "\n"
    );
  }

  getTick(): number {
    return this.tick;
  }
}
