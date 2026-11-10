import { Graphics, type Container } from "pixi.js";
import { C } from "../config";
import type { LeaderboardEntry } from "../types";
import { formatScore } from "../utils";
import { makeText } from "./theme";

export interface LeaderboardTableOptions {
  x: number;
  y: number;
  width: number;
  rows?: number;
  highlightId?: string;
  rowHeight?: number;
  fontSize?: number;
  showCaught?: boolean;
  showHeader?: boolean;
}

/**
 * Height taken by the table. Callers use this to size their panels before
 * drawing, so the menu and the full screen share one measurement.
 */
export function leaderboardTableHeight(
  rows: number,
  rowHeight = 13,
  fontSize = 10,
  showHeader = true,
): number {
  const header = showHeader ? Math.round(fontSize + 4) : 0;
  return header + rows * rowHeight;
}

/**
 * Compact rank / name / caught / score table. Bot rivals are deliberately
 * indistinguishable from players: no extra labels, just clean rows.
 */
export function drawLeaderboardTable(
  parent: Container,
  entries: LeaderboardEntry[],
  options: LeaderboardTableOptions,
): number {
  const { x, y, width } = options;
  const rowHeight = options.rowHeight ?? 13;
  const fontSize = options.fontSize ?? 10;
  const showCaught = options.showCaught ?? true;
  const showHeader = options.showHeader ?? true;
  const headerHeight = showHeader ? Math.round(fontSize + 4) : 0;
  const scoreRight = x + width;
  const caughtRight = showCaught
    ? x + width - Math.max(38, Math.round(fontSize * 4))
    : scoreRight;
  const nameX = x + Math.max(16, Math.round(fontSize * 1.8));
  const rankX = x + 2;
  const labelSize = Math.max(7, fontSize - 2);
  const visible = entries.slice(0, options.rows ?? entries.length);

  if (showHeader) {
    const header = new Graphics();
    header
      .rect(x, y + headerHeight - 1, width, 1)
      .fill({ color: C.steel, alpha: 0.55 });
    parent.addChild(header);

    const rankHead = makeText("#", {
      size: labelSize,
      color: C.steelPale,
      weight: 600,
      letterSpacing: 0.5,
    });
    rankHead.position.set(rankX, y);
    parent.addChild(rankHead);

    const nameHead = makeText("ИМЯ", {
      size: labelSize,
      color: C.steelPale,
      weight: 600,
      letterSpacing: 0.8,
    });
    nameHead.position.set(nameX, y);
    parent.addChild(nameHead);

    if (showCaught) {
      const caughtHead = makeText("УЛОВ", {
        size: labelSize,
        color: C.steelPale,
        weight: 600,
        align: "right",
        letterSpacing: 0.5,
      });
      caughtHead.position.set(caughtRight, y);
      parent.addChild(caughtHead);
    }

    const scoreHead = makeText("ОЧКИ", {
      size: labelSize,
      color: C.steelPale,
      weight: 600,
      align: "right",
      letterSpacing: 0.8,
    });
    scoreHead.position.set(scoreRight, y);
    parent.addChild(scoreHead);
  }

  const startY = y + headerHeight;
  visible.forEach((entry, index) => {
    const rowY = startY + index * rowHeight;
    const highlighted = entry.id === options.highlightId;

    if (highlighted) {
      const highlight = new Graphics();
      highlight
        .rect(x - 2, rowY - 2, width + 4, rowHeight)
        .fill({ color: C.gold, alpha: 0.15 });
      highlight.rect(x - 2, rowY - 2, 2, rowHeight).fill(C.gold);
      parent.addChild(highlight);
    } else if (index % 2 === 0) {
      const stripe = new Graphics();
      stripe
        .rect(x - 2, rowY - 2, width + 4, rowHeight)
        .fill({ color: C.steel, alpha: 0.07 });
      parent.addChild(stripe);
    }

    const rankColor =
      index === 0
        ? C.gold
        : index === 1
          ? C.white
          : index === 2
            ? C.brownLight
            : C.steelPale;
    const nameColor = highlighted ? C.gold : C.cream;

    const rank = makeText(`${index + 1}`, {
      size: fontSize,
      weight: 700,
      color: rankColor,
    });
    rank.position.set(rankX, rowY);
    parent.addChild(rank);

    const maxName = Math.max(6, Math.floor((caughtRight - nameX) / 4.6));
    const displayName =
      entry.name.length > maxName
        ? `${entry.name.slice(0, maxName - 1)}…`
        : entry.name;
    const name = makeText(displayName, {
      size: fontSize,
      weight: highlighted ? 700 : 500,
      color: nameColor,
    });
    name.position.set(nameX, rowY);
    parent.addChild(name);

    if (showCaught) {
      const caught = makeText(`${entry.caught}/10`, {
        size: fontSize - 1,
        color: highlighted ? C.cream : C.steelPale,
        align: "right",
      });
      caught.position.set(caughtRight, rowY + 1);
      parent.addChild(caught);
    }

    const score = makeText(formatScore(entry.score), {
      size: fontSize + 1,
      weight: 700,
      color: highlighted ? C.gold : C.yellow,
      align: "right",
    });
    score.position.set(scoreRight, rowY - 1);
    parent.addChild(score);
  });

  return headerHeight + visible.length * rowHeight;
}
